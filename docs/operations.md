# fwqgo 工程与数据运维约定

本文档记录代码边界、秘密字段、时间、套餐汇率和历史数据保留的统一约定。数据库结构以 `packages/db/schema.ts` 为准，版本化变更以 `drizzle/` 和 `_journal.json` 为准。

## 1. 代码依赖边界

依赖方向保持由应用层指向底层：

```text
apps/* -> src/features/* -> src/server/* -> packages/*
                         -> src/components/*
```

- `apps/web` 和 `apps/cms` 只保留 Next.js 应用入口、路由映射、proxy 和构建配置。
- `src/features/public` 与 `src/features/cms` 分别拥有公开站和后台用例；共享能力放在 `src/features/shared`。
- `src/server` 拥有数据库工作流、采集、后台任务、审计、缓存失效和第三方服务编排。
- `packages` 只提供不依赖应用路由的核心逻辑、数据库访问、认证、缓存和 AI 客户端。
- `packages/**` 禁止导入 `@/**`、`src/**`，也禁止通过相对路径跨入 `src`。
- 已下沉到 `src/server` 的兼容转发模块不再保留；已删除的数据库实体不能重新导出。

运行 `bun run verify:architecture` 检查上述边界。双应用构建后的路由隔离由 `bun run verify:apps` 检查。

## 2. 秘密字段与密钥轮换

AI 改写 API Key、生图 API Key 和供应商采集秘密请求头使用 AES-256-GCM 信封加密。数据库中的格式为 `enc:v1:<keyId>:<iv>:<ciphertext>:<tag>`，主密钥只存在于运行环境。

推荐使用密钥环：

```env
SECRET_ENCRYPTION_KEYS=2026-07:<32-byte-base64url-key>,2026-01:<old-key>
SECRET_ENCRYPTION_ACTIVE_KEY_ID=2026-07
```

也可以把 `SECRET_ENCRYPTION_KEYS` 写成 JSON 对象。`SECRET_ENCRYPTION_KEY` 是单密钥兼容配置，key ID 固定为 `default`；密钥环存在时优先使用密钥环。每把密钥必须解码为 32 字节，可用下面的命令生成：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

轮换步骤：

1. 在 `SECRET_ENCRYPTION_KEYS` 中同时保留旧密钥和新密钥，把 active key ID 指向新密钥。
2. 发布所有 CMS 实例，确认新配置可同时解密旧值并加密新值。
3. 运行 `bun run secrets:migrate` 做只读演练，记录待迁移数量。
4. 备份数据库后运行 `bun run secrets:migrate --write`。
5. 再次运行只读演练，结果应为 0。
6. 等待旧 release 回滚窗口结束后再移除旧密钥。

不要在迁移完成前删除旧密钥，否则旧密文将无法解密。Actions 只合并非空密钥配置；GitHub 未配置相关 Secret 时，服务器共享 `.env.production` 中的现有值会被保留。

## 3. 时间与时区

当前 Drizzle schema 使用 PostgreSQL `timestamp without time zone`。为避免同一个时间在不同主机上发生偏移，项目约定：

- PM2 生产进程固定 `TZ=UTC`。
- 应用数据库连接和生产迁移连接固定 PostgreSQL 会话 `TimeZone=UTC`。
- 后端使用 `Date` 表示时间点，对 API 和任务 payload 输出 `toISOString()`。
- 数据库中的无时区时间按 UTC 解释；不要写入带业务本地时区含义但没有 offset 的字符串。
- CMS 或公开站显示北京时间时，在展示层使用明确的 `Asia/Shanghai` 格式化，不修改存储值。
- 本地直接运行 Drizzle Kit 或 SQL 工具时，应让数据库角色默认时区为 UTC，或在会话中设置 `TimeZone=UTC`。

新增时间字段时优先评估 `timestamp with time zone`。如果继续使用无时区字段，必须遵守上述 UTC 约定。

## 4. 套餐汇率

`server_exchange_rates.unitsPerUsd` 表示“一美元对应多少目标币种”。例如 CNY 为 `7.2` 时，人民币价格的标准美元月价计算为：

```text
monthlyPriceUsd = amount / unitsPerUsd / termMonths
```

支持币种为 USD、CNY、EUR、GBP、HKD、JPY、CAD、AUD。读取规则：

- 优先读取 `server_exchange_rates` 中启用且为正数的记录。
- 缺失或停用的币种使用 `packages/core/server-offer-price.ts` 中的内置回退值。
- 迁移种子和内置值只用于系统启动与故障回退，不是实时金融报价。
- 运行时快照缓存 5 分钟；修改数据库汇率后最多等待一个缓存周期生效。
- 更新汇率时同时维护 `source`、`fetchedAt`、`updatedAt`，并保留 USD 为 1。

当前项目不自动调用外部汇率服务。运营方应按业务精度要求更新数据库；展示和采集日志需要保留汇率来源，不能把初始迁移值描述为实时价格。

## 5. 历史数据保留

清理只处理终态任务和可再生的运行记录，不自动删除文章、套餐、有效图片资产或仍被任务引用的来源素材。

| 数据                         | 默认保留 | 环境变量或规则                                       |
| ---------------------------- | -------: | ---------------------------------------------------- |
| 通用后台作业                 |    14 天 | `ADMIN_BACKGROUND_JOB_RETENTION_DAYS`，范围 1-365 天 |
| AI 改写任务及无引用来源素材  |   180 天 | `AI_TASK_RETENTION_DAYS`，范围 7-3650 天             |
| 封面生成终态任务             |    90 天 | `COVER_TASK_RETENTION_DAYS`，范围 7-3650 天          |
| 供应商运行记录和已处理候选项 |    90 天 | `PROVIDER_TASK_RETENTION_DAYS`，范围 7-3650 天       |
| 管理员审计日志               |   365 天 | `ADMIN_AUDIT_RETENTION_DAYS`，范围 7-3650 天         |
| 套餐探测记录                 |    30 天 | 代码常量，供应商监控运行时清理                       |
| 过期登录会话                 |   到期后 | 下一次成功登录事务中清理                             |

运营保留任务每天通过通用后台作业队列调度。删除某类历史前，应先确认法规、审计和问题追踪要求；需要长期保留时提高对应天数，而不是关闭整个清理 worker。

CMS 后台 worker 在 `NODE_ENV=production` 时默认启动，在开发和测试环境默认关闭，避免本地进程意外消费共享或生产数据库中的任务。只有连接到结构完整、可安全写入的本地专用数据库时，才应设置 `ENABLE_CMS_BACKGROUND_WORKERS=true` 联调；生产紧急停机可显式设置为 `false`。

## 6. 数据库变更检查

对已有数据库执行迁移前：

1. 备份数据库。
2. 同时检查实际 schema 与 `drizzle.__drizzle_migrations`。
3. 运行 `bun run verify:migrations` 和相关迁移回归测试。
4. 先在结构与数据量接近生产的临时 PostgreSQL 中执行迁移。
5. 确认回填、约束和索引完成后，再进入生产发布流程。

如果表或列已经存在但迁移记录缺失，应先建立正确基线；不要用 `db:push` 或重复执行历史 SQL 猜测修复。
