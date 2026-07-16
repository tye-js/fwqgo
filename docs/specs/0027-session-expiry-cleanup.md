# CMS 过期会话清理规格

- Issue: [#27](https://github.com/tye-js/fwqgo/issues/27)
- 类型: Spec
- 基线: `origin/main@331153534a4c8bff5b72e29fed8dc023568bb307`
- 状态: 待实现

## 1. 背景

CMS 每次成功登录都会创建一条有效期 30 天的 `sessions` 记录。当前只有显式退出会删除当前会话，自然过期、Cookie 丢失和设备更换产生的无效记录不会被清理。认证查询会过滤过期记录，但 `sessions.expires` 没有索引，表会持续增长且未来清理需要扫描整表。

## 2. 目标与边界

- 仅在用户名和密码验证成功后执行会话维护。
- 使用一次捕获的 `now`，删除所有 `expires <= now` 的会话。
- 过期清理与新会话插入必须位于同一数据库事务。
- 新会话过期时间保持为 `now + 30 days`。
- 为 `sessions.expires` 增加普通 B-tree 索引 `sessions_expires_idx`。
- Cookie 名称、属性、session id、sessionToken 和登录响应保持不变。
- 未过期会话和现有并发登录行为保持不变。

## 3. 模块设计

新增 auth 会话生命周期/存储模块，向登录 Route Handler 提供一个窄接口：

1. 集中定义 30 天 TTL，并可基于显式 `now` 计算过期时间。
2. 在事务中先删除 `expires <= now` 的记录。
3. 使用随机 UUID 创建 session id 与 sessionToken。
4. 插入新会话并返回数据库行；数据库未返回行时返回空结果，由现有 Route Handler 生成可读错误。

登录 Route Handler 只负责请求校验、凭据验证、限速、调用会话存储接口、设置 Cookie 和构造响应，不再直接拼装会话生命周期 SQL。

## 4. 并发与失败语义

- 多个成功登录并发执行时，重复删除同一批过期行是幂等的。
- 删除发生在插入之前，新创建的会话不会被当前事务清理。
- 事务任一步骤失败时，清理和插入一起回滚，登录继续走现有 500 错误路径。
- 不将清理改为每次 CMS 请求执行，避免给认证热路径增加写操作。
- 不增加定时 worker；没有新登录时，过期行暂时保留但不会影响认证正确性。

## 5. 数据库迁移

- 在 `packages/db/schema.ts` 的 `sessions` 表声明 `expiresIdx`。
- 生成下一条 Drizzle 迁移，只创建 `sessions_expires_idx`。
- 迁移不删除生产数据；已有过期行在下一次成功登录时由运行时代码清理。
- 不修改主键、唯一约束、外键或时间字段类型。

## 6. 测试计划

1. 单元测试验证 30 天 TTL 使用传入的稳定时钟，不读取漂移的系统时间。
2. 回归测试验证登录入口调用共享会话创建函数，不再直接插入 `sessions`。
3. 回归测试验证会话存储使用事务和 `expires <= now` 清理条件。
4. 回归测试验证 schema 与迁移都包含 `sessions_expires_idx`。
5. 运行现有迁移清单验证、lint、typecheck、全量测试和双应用构建。

## 7. 验收标准

- [ ] 成功登录会清理 `expires <= now` 的过期会话
- [ ] 清理和插入位于同一事务
- [ ] 新会话有效期仍为 30 天
- [ ] 未过期会话不会被删除
- [ ] 会话插入无返回行时保留现有可读错误
- [ ] `sessions_expires_idx` 同时存在于 schema 和迁移
- [ ] 登录 Route Handler 不再直接插入 `sessions`
- [ ] 会话生命周期回归测试通过
- [ ] `npm run lint` 通过
- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过
- [ ] `npm run verify:migrations` 通过
- [ ] `SKIP_ENV_VALIDATION=1 npm run build` 通过

## 8. 非目标

- 不修改 Cookie 或认证协议
- 不限制单用户活跃会话数量
- 不刷新活跃会话有效期
- 不在每个请求上执行数据库清理
- 不引入 Redis、定时任务或外部会话服务
- 不哈希或迁移现有 session id/sessionToken
- 不执行生产迁移或部署

## 9. 风险与回退

主要风险是成功登录时增加一次有索引支持的删除语句。删除范围由数据库时间值严格限定为已过期行，并与插入处于同一事务。回退时撤销 auth 存储与登录入口改动；索引可安全保留，若需删除应通过新的向前迁移完成。
