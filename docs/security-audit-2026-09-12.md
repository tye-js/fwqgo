**fwqgo 前后台代码审计与修复记录 · 2026-09-12**

本轮确认并修复 7 类问题：P1 两类、P2 五类。P1 主要影响数据完整性和服务可用性；P2 涉及请求来源验证、并发限速、缓存正确性和依赖安全。没有确认 P0 级漏洞。所有修复均位于本地工作区，线上效果仍需发布后验收。

审计基线为 `77cf070`，开始时工作区干净。范围包括 `apps/web`、`apps/cms`、`src/features/public`、`src/features/cms`、共享模块、`packages`、服务端抓取/AI/图片/缓存模块，以及依赖锁文件、数据库约束和部署配置。采用全仓入口与危险操作扫描、人工追踪敏感调用链和本地隔离回归，应用代码约 11 万行。构建产物确认 Web 49 个路由、CMS 50 个路由；CMS 源码共 135 个 Server Action 导出，其中 111 个函数声明、24 个 `defineAdminAction` 包装导出。

| 优先级 | 问题 | 类型 | 修复状态 |
| --- | --- | --- | --- |
| P1 | 创建文章的事务内再次申请全局数据库连接，可能耗尽连接池 | 可用性 | 已修复 |
| P1 | 已发布文章先写正文、再保存标签及检查发布；失败后可能留下已公开的部分修改 | 数据完整性 | 已修复 |
| P2 | 使用 Cookie 的 CMS 写接口缺少独立来源验证 | CSRF 防护 | 已修复 |
| P2 | 登录限速在密码校验失败后才计数，并发请求可同时通过检查 | 认证接口限速 | 已修复 |
| P2 | 原路径替换图片与长期缓存冲突，前后台可能继续显示旧图 | 缓存正确性 | 已修复 |
| P2 | 套餐专题把数据库异常转换成可缓存的空列表 | 可用性 | 已修复 |
| P2 | 锁文件中 3 个依赖包存在已知漏洞告警 | 依赖安全 | 审计已清零 |

1. **P1：事务连接池耗尽。** `createPostRecordInTransaction()` 在持有事务连接时调用正文短链处理；旧短链处理再次通过全局 `db` 读取商家和短链。单连接配置下会相互等待；默认连接池为 4 时，足够多的并发创建也可能占满连接。手动创建和 AI 草稿保存均使用这条调用链。

   修复：将当前执行器传递到正文处理、商家查询和短链读写，每篇正文仍只读取一次商家配置。短链插入同时处理目标 URL 与 slug 的唯一性冲突，避免唯一键异常使外层 PostgreSQL 事务进入失败状态后继续查询。返利参数替换及 `affParam === "href"` 的行为保留。

   位置：[文章创建事务](/Users/liulu/Desktop/fwqgo/src/server/posts/create-post-record.ts:179)、[短链数据库执行器](/Users/liulu/Desktop/fwqgo/src/server/links/outbound-short-link.ts:25)。隔离测试在任何额外全局连接申请时立即失败，验证带多个购买链接的正文可以仅通过事务执行器完成，且商家配置只读取一次。

2. **P1：文章保存和发布不原子。** 旧编辑 API 依次调用正文、标签和基础信息三个保存操作。已发布文章的正文先被更新并刷新公开缓存；随后标签失败、slug 冲突或发布检查失败时，较早的修改已经生效。部分保存接口还可以单独调用。

   修复：编辑 API 改为一次完整保存。字段校验及正文检查完成后，在同一数据库事务中锁定文章、核对版本、保存标签与正文、更新发布状态；全部提交后才刷新缓存。失败保留原文章和原标签。增加 `expectedUpdatedAt` 冲突检查；列表编辑和批量发布也核对所审核的正文是否仍为当前版本。原先拆分的正文、标签 Server Action 已移除。数据库异常向客户端返回可读的通用错误。

   位置：[原子保存](/Users/liulu/Desktop/fwqgo/src/features/cms/actions/post.ts:1019)、[统一校验](/Users/liulu/Desktop/fwqgo/src/features/cms/lib/post-edit.ts:14)、[编辑 API](/Users/liulu/Desktop/fwqgo/src/features/cms/routes/api/cms/posts/[id]/edit/route.ts)。故障注入验证了标签写入失败时正文和标签一起回滚、发布检查失败时旧文章保持不变、缓存不会提前刷新，以及旧版本提交返回 409。

3. **P2：Cookie 写接口缺少来源验证。** 普通 Route Handler 不自动获得 Server Action 的来源检查。会话 Cookie 的 `SameSite=Lax` 对同站不同源场景仍会携带 Cookie，因此该问题的利用前提包含管理员会话及能够影响同站不同源页面。

   修复：登录、注册、退出、上传和文章编辑接口统一校验 `Origin` 与 `Sec-Fetch-Site`，拒绝缺失、`null`、外站和同站不同源来源。支持实际请求源及配置的 CMS 源，以兼容本地开发和反向代理。来源失败在业务操作前返回 403。非浏览器客户端调用这些接口时也需要发送正确的 `Origin`。

   位置：[来源校验](/Users/liulu/Desktop/fwqgo/packages/core/same-origin-request.ts:2)。回归覆盖正确源、开发源、外站、同站不同源、空来源及伪装 URL。

4. **P2：登录并发限速存在计数空窗。** 旧逻辑先检查次数，等待数据库和 bcrypt，然后才登记失败。同一账号的多个并发请求可在首次失败完成前全部进入昂贵的验证步骤。入口 Nginx 的 IP 限速会缓解风险，但不能替代应用的账号并发配额。

   修复：在任何数据库或密码校验等待之前登记本次尝试。隔离测试同时发起 32 个调用，确认仅 8 个进入密码验证，其余 24 个返回 429，随后请求仍被限速。

   位置：[登录配额预占](/Users/liulu/Desktop/fwqgo/src/features/cms/routes/api/auth/login/route.ts:127)。验证使用模拟密码校验和数据库，没有向真实登录接口发送尝试。

5. **P2：图片原路径替换后缓存仍指向旧内容。** 原图片接口声明一年 `immutable`，Next 图片优化又有独立缓存。替换文件和刷新页面缓存不能改变这些图片请求的缓存键；缩略图也可能重用旧文件名。

   修复：保留资产的基础 URL，为实际内容引用追加图片内容版本，覆盖文章封面、正文、知识库、头像和首页推广图。缩略图和大图文件名包含内容版本，CMS 预览使用图片 hash。公开图片源使用重新验证策略；图片变更同时失效相关内容缓存并清理文章、知识库的 CDN URL。文件写入采用临时文件加原子重命名，数据库失败时恢复原图并移除本次新建变体。替换同一资产时使用行锁。

   位置：[图片替换](/Users/liulu/Desktop/fwqgo/src/server/images/assets.ts:599)、[URL 版本处理](/Users/liulu/Desktop/fwqgo/packages/core/upload-image-version.ts:2)、[共享图片接口](/Users/liulu/Desktop/fwqgo/src/features/shared/routes/api/images/source/route.ts)、[CDN 清理](/Users/liulu/Desktop/fwqgo/src/server/cache/public-edge-cache.ts)。回归使用临时 WebP 文件，实际验证原文件恢复、新变体清理、引用版本更新及不误改外站同名图片。

6. **P2：数据库故障被缓存为零库存。** `getServerOfferTopic()` 使用 `use cache`，却在查询失败时返回正常的 `{ topic, offers: [] }`，使故障结果进入成功缓存，数据库恢复后也可能继续显示空库存。

   修复：查询失败时保留异常语义；不存在的专题仍正常返回空实体。隔离测试验证已知专题的数据库故障必须抛出异常。

   位置：[专题数据读取](/Users/liulu/Desktop/fwqgo/src/server/offers/server-offers.ts:305)。

7. **P2：依赖安全告警。** 初始审计命中 `brace-expansion`、`js-yaml`、`nanoid`。主要调用链为 ESLint、glob 和 PostCSS/构建依赖；本轮没有确认对应漏洞可从公开业务请求直接触发，因此没有将告警级别直接等同于线上高危漏洞。

   修复版本为 `brace-expansion` 1.1.18 / 5.0.9、`js-yaml` 4.3.2、`nanoid` 3.3.18。清理了在当前 Bun 中未实际约束旧子依赖的配置，并核对锁定版本及安装完整性。依赖审计和新增行为回归已加入质量检查及部署前检查。

   位置：[依赖配置](/Users/liulu/Desktop/fwqgo/package.json)、[锁文件](/Users/liulu/Desktop/fwqgo/bun.lock)。最终 `bun audit --json` 返回 `{}`。对应公告：[GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg)、[GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895)、[GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj)、[GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh)、[GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8)。

验证结果：

| 检查 | 结果 |
| --- | --- |
| `bun run check` | 通过，包含 lint、typecheck、仓库/架构/迁移清单/部署流程及内容、缓存、SEO 检查 |
| 本地测试 | 522 项通过 |
| 安全运行时回归 | 28 项在 Node 与 Bun 中分别通过，其中本轮新增 7 项 |
| 依赖审计 | 0 告警 |
| 本地无数据库构建 | Web、CMS、standalone 打包及路由边界检查通过，退出码 0 |
| `git diff --check` | 通过 |

构建使用显式的无数据库验证配置和不可用的本地测试地址。线路规则与服务器选型规则读取记录了预期的 `ECONNREFUSED` 并使用已有默认规则；最终构建成功。这份构建结果不代表生产数据库或真实内容预渲染已验收。

还核查了管理员角色与会话验证、公开读库边界、HTML/JSON-LD 输出、URL/DNS/重定向限制、文件路径与上传限制、参数化 SQL、密钥存储及公开 RSC 缓存边界。现有防护仍保留。仓库已跟踪文件的常见私钥和令牌模式扫描未发现命中。

新增关键回归位于 [verify-audit-regressions.test.ts](/Users/liulu/Desktop/fwqgo/scripts/verify-audit-regressions.test.ts)，随仓库和 CI 运行。另修正了本地 `tests/` 中引用已移除 loading 文件及旧短链接口形状的过期断言；该目录仍按项目原规则被 Git 忽略。

本轮没有连接生产数据库，也没有执行生产迁移、提交或部署。验证覆盖本地逻辑、故障注入和构建，未进行真实管理员浏览器操作或生产渗透测试；不能据此宣称前后台不存在其他漏洞。
