# CMS 来源站后台任务重启恢复规格

关联 Issue：[#36](https://github.com/tye-js/fwqgo/issues/36)

## 背景

来源站手动抓取使用持久化的 `admin_background_jobs`，任务 key 为
`ai-source-site:<sourceSiteId>`。当前执行函数只以闭包形式保存在 CMS 进程内的
`jobRunners` Map 中，数据库没有保存可执行函数。

CMS 进程重启后，数据库中的 queued/running 任务仍存在，但启动恢复流程只恢复固定
AI、封面、套餐 worker 和库存监控。来源站动态 key 没有重新注册，claim 查询因此不会
选择这些任务，最终表现为来源站任务永久排队。

## 目标

1. 将来源站任务 runner 从 Server Action 闭包下沉到可复用 server 模块。
2. runner 执行时按 `sourceSiteId` 读取最新数据库配置，避免使用入队时的过期快照。
3. 后台队列提供只注册 runner、不插入任务的窄 API。
4. CMS 启动时恢复数据库中已有 queued/running 来源站任务对应的 runner。
5. 注册完成后唤醒 worker，让 queued 任务和 stale-running 恢复继续沿用现有机制。
6. 已删除或停用的来源站任务以可读错误失败，不能静默挂起。

## 设计

### 后台队列 API

- 新增 `registerAdminBackgroundJobRunner()`，只维护当前进程的 key、label 和执行函数。
- 新增只唤醒已注册 runner 的 API，不插入或修改数据库任务。
- `enqueueAdminBackgroundJob()` 复用 runner 注册 API，保持现有入队语义。
- 注册和唤醒保持幂等，允许多个 CMS 进程执行同一启动恢复流程。

### 来源站后台模块

新模块集中负责：

- 构造和解析 `ai-source-site:<id>` key。
- 按 ID 读取来源站最新配置。
- 校验来源站仍存在且已启用。
- 执行抓取并回写成功统计或失败原因。
- 注册 runner、正常入队和启动恢复。

Server Action 只负责鉴权、前置校验、更新排队状态并委托共享模块，不再捕获整份来源站
对象。

### 启动恢复

CMS instrumentation 调用的恢复流程查询 `admin_background_jobs` 中 status 为 queued 或
running、且 key 符合来源站前缀的记录。流程去重并校验 key 后注册 runner，然后只唤醒
worker。

恢复流程不得插入新任务，也不得为 active running 任务增加 queued 副本。多进程重复
注册和唤醒由现有数据库 status、running 排他条件、heartbeat 和 claim 条件保证只执行
一次。

## 错误语义

- key 格式非法：忽略并记录结构化告警，不注册任意 key。
- 来源站已删除：runner 抛出“来源站配置不存在”，任务进入现有失败/重试流程。
- 来源站已停用：runner 抛出“来源站已停用”，任务进入现有失败/重试流程。
- 抓取失败：来源站 `lastError` 和 `lastRunDetails` 保存可读错误，任务沿用现有重试策略。

## 验收标准

- [ ] 重启后 queued 来源站任务会重新获得 runner 并可被领取。
- [ ] stale running 任务经过现有恢复逻辑后可继续执行。
- [ ] active running 任务不会产生重复 queued 任务。
- [ ] runner 使用执行时最新来源站配置。
- [ ] 已删除或停用来源站的任务明确失败。
- [ ] Server Action 不再保存来源站配置闭包。
- [ ] 启动恢复只注册数据库中既有任务，不创建新任务。
- [ ] 固定 worker、库存监控和其他动态任务行为不变。
- [ ] `npm run lint` 通过。
- [ ] `npm run typecheck` 通过。
- [ ] `npm test` 通过。
- [ ] `SKIP_ENV_VALIDATION=1 npm run build` 通过。

## 非目标

- 不持久化单篇抓取或无文章封面临时状态。
- 不恢复其他动态 runner。
- 不修改后台任务 schema、重试、lease 或并发规则。
- 不自动运行没有既有 queued/running 任务的来源站。
- 不新增定时抓取。
- 不部署。

## 风险与回退

本变更不包含数据库迁移。主要风险是启动恢复误创建任务或动态 key 解析过宽；通过只读
查询、严格 key 解析和“注册后仅唤醒”约束规避。回退时移除启动恢复调用和共享来源站
runner 模块即可，现有任务表数据不受影响。
