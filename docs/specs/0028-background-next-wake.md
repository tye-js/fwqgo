# 后台 worker 下一任务唤醒规格

- Issue: [#28](https://github.com/tye-js/fwqgo/issues/28)
- 类型: Spec
- 基线: `origin/main@331153534a4c8bff5b72e29fed8dc023568bb307`
- 状态: 待实现

## 1. 背景

持久化后台队列用单个 `workerWakeTimer` 合并未来唤醒时间。已有更早定时器时忽略较晚任务是正确的，但定时器触发后会被清空；worker 处理当前到期任务并排空 lanes 后，只调度 stale/blocked recovery，没有为仍在队列中的下一条未来任务重新设置定时器。

因此先入队的 A 在 10:00 执行后，原本计划 10:05 执行的 B 可能无限保持 `queued`，直到另一任务入队、其他定时器碰巧唤醒或进程重启。多个库存监控也会产生执行漂移。

## 2. 目标与边界

- worker lanes 每次排空后重新查找下一条可运行的排队任务。
- 查询只考虑当前进程已注册 runner 的 `jobKey`。
- 查询排除存在同 `jobKey`、`status = running` 记录的任务。
- 按 `runAfter`、`id` 升序选择一条，交给现有单定时器调度器。
- 保留现有 blocked recovery、wake version、claim 状态条件与并发数。
- 不增加固定轮询、数据库字段、索引或迁移。

## 3. 查询语义

新增 `scheduleNextQueuedBackgroundJob()`：

1. 读取当前 `jobRunners` keys；为空时直接返回。
2. 查询 `admin_background_jobs.status = queued`。
3. 限定 `jobKey in registeredKeys`。
4. 使用 `not exists` 排除同 key 的 running 任务，避免对暂时不可领取的任务立即空转。
5. 按 `runAfter asc, id asc` 读取一条。
6. 有结果时调用现有 `scheduleAdminBackgroundJobWorker(runAfter)`；无结果时不创建定时器。

该查询可以使用现有 `status/runAfter` 与 `jobKey` 索引，不需要 schema 变更。

## 4. worker 调用顺序

`runAdminBackgroundJobWorker()` 保持以下顺序：

1. 恢复 stale 任务并清理终态历史。
2. 并发 lanes 领取并执行所有当前可运行任务。
3. lanes 全部排空后调度下一条未阻塞 queued 任务。
4. 调度被 running 同 key 阻塞任务的超时恢复。

两个末尾调度都复用“保留更早定时器”的现有规则，因此调用先后不会丢失更早唤醒。若查询结果已到期，现有 wake version 会在当前 worker promise 结束后立即启动下一轮。

## 5. 并发与失败语义

- 多个 CMS 进程可以各自设置本地定时器；数据库 claim 的 `status = queued` 条件仍保证只有一个进程领取成功。
- 查询与定时器之间任务被其他进程领取时，只产生一次无害的空唤醒。
- 查询失败沿用 worker 顶层错误日志，并由后续入队或启动恢复；不吞掉数据库错误。
- 不改变任务重试、attempts、payload 合并或终态清理行为。

## 6. 测试计划

1. 调度策略测试覆盖 A/B 两个未来时间点，确认 A 的定时器触发后 B 能成为下一唤醒点。
2. 回归测试验证 worker lanes 结束后调用下一 queued 任务调度。
3. 回归测试验证查询包含 registered keys、queued 状态、running 同 key 排除及稳定排序。
4. 验证没有候选任务时不安排唤醒。
5. 运行 lint、typecheck、全量测试和双应用构建。

## 7. 验收标准

- [ ] A 执行后，未来任务 B 获得新的确定唤醒时间
- [ ] running 同 key 阻塞任务不会造成即时空转
- [ ] 未注册 runner 的任务不会被当前进程调度
- [ ] 没有候选任务时不创建定时器
- [ ] 新入队的更早任务仍可替换较晚定时器
- [ ] claim 与多进程并发安全语义不变
- [ ] 不新增轮询、schema 或迁移
- [ ] 调度回归测试通过
- [ ] `npm run lint` 通过
- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过
- [ ] `SKIP_ENV_VALIDATION=1 npm run build` 通过

## 8. 非目标

- 不重写持久化队列或 runner 注册模型
- 不处理动态 runner 在进程重启后的恢复
- 不改变并发、重试、保留或任务业务逻辑
- 不修改 AI、图片、套餐和库存表
- 不部署

## 9. 风险与回退

新增查询仅在 worker 排空时执行，并限定已注册 runner。多进程冗余定时器不会绕过数据库 claim。若出现调度异常，可移除末尾查询调用回退，无数据迁移和生产数据回滚要求。
