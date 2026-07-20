# 临时任务活跃项保护规格

- Issue: [#33](https://github.com/tye-js/fwqgo/issues/33)
- 类型: Spec
- 基线: `origin/main@331153534a4c8bff5b72e29fed8dc023568bb307`
- 状态: 待实现

## 1. 背景

单篇抓取与无文章封面生图用内存 Map 保存临时任务详情，并用持久化 `admin_background_jobs` 执行。当前 Map 超过 50/30 条后会直接删除最老项，不区分终态和 `queued/running` 活跃态。runner 找不到已被删除的状态时静默返回，后台 job 随后被错误标记为 `succeeded`。

这会同时造成活跃任务丢失、CMS 状态不可查询和运维看板伪成功。

## 2. 目标与边界

- 临时 Map 回收只能删除调用方明确判定为终态的条目。
- 终态候选按最旧优先淘汰，并使用稳定顺序处理同优先级。
- 新任务写入前必须预留一个容量槽位。
- 容量全部被活跃任务占用时拒绝新任务，不删除任何活跃项。
- 两个提交入口返回可读的容量不足信息。
- runner 找不到任务状态时抛出错误，使后台 job 失败而不是成功。
- 保持抓取 50 条、临时封面 30 批的现有上限。

## 3. 共享容量策略

新增通用 `reserveBoundedMapCapacity()` helper，输入：

- 目标 `Map`
- `maxEntries`
- 本次需要的 `incomingEntries`，默认 1
- `isEvictable(value, key)` 终态判断
- `getEvictionPriority(value, key)` 淘汰时间/优先级

行为：

1. 验证容量参数是有效整数。
2. 计算 `map.size + incomingEntries - maxEntries` 所需释放数量。
3. 仅收集 `isEvictable = true` 的候选。
4. 按 priority 升序、原 Map 顺序稳定排序。
5. 删除最多所需数量的最旧终态项。
6. 返回是否已为 incoming entries 留出足够空间。

helper 可以部分删除终态项后仍返回 `false`，但不得删除任何活跃项。调用方仅在返回 `true` 时写入新任务。

## 4. 抓取任务

- `success`、`failed` 为可淘汰终态；`queued`、`running` 不可淘汰。
- 使用 `updatedAt` 作为淘汰优先级。
- 在生成并写入新任务前预留容量。
- 容量不足时返回“当前活跃抓取任务过多”，建议等待任务完成后重试。
- `runScrapeJob()` 找不到 job 时抛出“抓取任务状态已丢失”错误。

## 5. 临时封面任务

- 只有批次内所有任务都属于 `succeeded/failed/cancelled` 时才可淘汰。
- 使用批次任务最早 `finishedAt` 作为淘汰优先级；缺少时间时使用稳定兜底值。
- 在写入 `ephemeralCoverBatches` 前预留容量。
- 容量不足时返回“当前活跃封面生成任务过多”的结构化失败。
- runner 找不到批次或任务时抛出“临时封面任务状态已丢失”错误。

## 6. 并发与失败语义

- helper 与 Map 写入在同一同步调用栈中执行，单个 Node.js 进程内不会被异步步骤插入。
- 该修复不使 Map 跨进程共享；每个进程仍维护自己的临时状态。
- 容量拒绝发生在后台 job 入队前，不会留下无状态的持久化 job。
- missing-state 抛错由现有后台 job 错误处理记录，`maxAttempts = 1` 的临时任务会进入 failed。

## 7. 测试计划

1. 纯策略测试验证最旧终态优先淘汰。
2. 纯策略测试验证活跃项永不删除，容量不足返回 false。
3. 纯策略测试验证稳定排序、部分可回收和参数边界。
4. 源码不变量测试验证两个 action 在 Map.set 前预留容量并处理 false。
5. 源码不变量测试验证两个 runner 的 missing-state 分支抛错。
6. 运行 lint、typecheck、全量测试和双应用构建。

## 8. 验收标准

- [ ] 回收只删除终态任务
- [ ] 最旧终态优先淘汰
- [ ] 活跃任务达到上限时拒绝新任务
- [ ] 被拒绝时已有活跃任务全部保留
- [ ] 两个入口返回可读容量提示
- [ ] 两个 runner 状态缺失时后台 job 失败
- [ ] 两个调用点复用同一容量 helper
- [ ] 不改变 50/30 上限
- [ ] 不修改数据库 schema 或迁移
- [ ] `bun run lint` 通过
- [ ] `bun run typecheck` 通过
- [ ] `npm test` 通过
- [ ] `SKIP_ENV_VALIDATION=1 bun run build` 通过

## 9. 非目标

- 不把临时任务持久化到数据库
- 不解决服务重启或多进程间状态恢复
- 不修改持久化后台队列
- 不改变抓取、生图、AI 或图片资产业务
- 不提高任务容量
- 不部署

## 10. 风险与回退

行为变化仅发生在临时任务容量耗尽时：由隐式删除活跃任务改为显式拒绝新任务。helper 的删除范围由调用方终态谓词限制。回退不涉及数据库、迁移或生产数据恢复。
