# 安全修复与发布检查

本轮按未发生密钥泄漏处理，保留现有账号和会话，不轮换 AI、供应商或缓存刷新密钥。

下列行为描述已实现的代码与配置方案，不代表全部已在线上生效。生产实际执行范围见文末的日期记录。

## 已落实的行为

- 出站 HTTP 使用安装包的 `undici/index.js`，在 Bun 1.3.14 与 Node 24 中绑定已验证的 DNS 地址；每一跳重新验证，跨域跳转移除认证头。IPv6 使用二进制网段判断，拒绝内网、映射、NAT64、6to4、Teredo 与保留地址。
- CMS 登录始终按账号限流，有可信 IP 时再增加 IP 配额。生产只接受受信入口覆盖的 `X-Real-IP`，不回退到客户端可控的转发头。浏览量请求没有可信 IP 时不写数据库。
- `0069` 保持已有账号的后台权限；`0070_default_new_users_to_viewer.sql` 将新账号默认权限改为 `viewer`。登录与会话检查均要求 `active admin`。公开注册默认关闭，打开后也只能创建 viewer，管理员授权需单独明确执行。
- Web 环境不持有 CMS 解密主密钥及 Basic Auth 密码；Cloudflare 缓存清理 Token 保留给实际执行清理的 Web 接口。生产读库和埋点库缺少独立 URL 时启动失败。
- 上传先累计检查整个 multipart 请求的实际字节数，上限 10 MB，再解析表单；单图上限仍为 8 MB。无长度头、虚报长度与额外字段均受总量限制。
- HTML 字段正则使用 RE2JS 的线性时间匹配，最多 200 字符，单字段输入最多 64 KB。保留 128 项编译缓存，淘汰对象由 JavaScript 回收，不再依赖固定大小的 WASM 堆和手工打包。回溯引用和前后向断言仍返回配置错误，不降级到 JavaScript RegExp。
- PM2 在一处合并文件和启动环境，再按角色键清单转发。CMS 保留 AI 超时、后台任务并发数与保留天数；两个应用都清除继承的构建跳过开关。会话读取仅在同一次 RSC 请求内去重，下一次请求重新验证权限。
- 采集草稿保留选择器、字段映射和默认值，但不保存任何请求头或未知配置字段；无法安全解析的 JSON 不写入草稿。短链转换只修改目标链接，保留中英文标签及其格式。
- 首页、分类、SEO 和套餐核心缓存遇到数据库错误时抛出异常，避免把故障写成空的成功结果。
- CMS CSP 允许本地 `blob:` 图片预览；开发模式允许 HMR，不启用 HTTPS 升级和 HSTS。正式环境保留禁止嵌入等安全头。Next.js 当前内联启动脚本仍需要 `unsafe-inline`，这不是完整的 nonce CSP。

## 发布前必须完成

1. 在可信服务器控制台或现有已验证连接中取得 SSH 主机公钥，并独立核对指纹。把匹配 `DEPLOY_HOST` 与端口的完整 known_hosts 行保存为 GitHub Secret `DEPLOY_KNOWN_HOSTS`。非 22 端口的主机字段需要 `[host]:port`，不能只填 `SHA256:...` 指纹。
2. 安装 `deploy/nginx/fwqgo-security-rate-zones.conf` 到 Nginx 的 `http` 上下文。把其余安全片段放到 `/etc/nginx/snippets/`，在现有 HTTPS server 中分别引入 CMS、公开浏览量限制和安全响应头片段。所有代理 location 都要覆盖 `fwqgo-proxy-headers.conf` 中的请求头；若现有 location 定义过代理头，需要逐项检查继承关系。不要重复创建同路径的 location。自定义端口要同步调整 upstream。
3. 使用 Cloudflare 等上游代理时，仅对其真实、经过核验的 CIDR 设置 `set_real_ip_from`，再设置对应 `real_ip_header`；不得信任所有来源。检查源站入口和防火墙，避免所有用户被识别为同一 CDN 地址。运行 `nginx -t` 后按现有运维流程加载配置。
4. 确认 Nginx 已覆盖真实 IP 后，把 GitHub Variable `TRUST_PROXY_HEADERS` 设置为 `true`。CI 会合并该值，且在切换版本前检查运行配置。两个 PM2 应用绑定 `127.0.0.1`，通过反向代理访问。
5. 常规部署由用户提交并推送 `main` 后交给 GitHub Actions。发布包包含 `0069` 与 `0070`，由已有生产迁移步骤执行。上线前仍需确认生产 schema 和 Drizzle 迁移记录一致，不手工重跑已有迁移。

正式构建通过 `scripts/build-release.mjs` 先核验只读数据库可达性。若 `READ_DATABASE_URL` 使用服务器回环地址，CI 复用已固定主机公钥的部署 SSH 连接，将 runner 的 `127.0.0.1:55433` 临时转发到该数据库端口；构建完成或失败后关闭。构建子进程的所有数据库连接仅使用只读账号，原始部署环境与运行期写库配置不变。无需开放数据库公网端口；隧道或数据读取失败时直接终止发布，不生成默认内容替代真实数据。

浏览器抓取在主 CMS 进程中保持关闭，发布预检会拒绝 `ENABLE_BROWSER_SCRAPING=true`。原先要求 Puppeteer 的来源（例如 `vpsgongyi.net`）先尝试静态抓取；确实依赖 JavaScript 的页面须配置独立隔离环境后再接入，不能仅在主服务打开开关。

## 验证

```bash
bun run verify:security
bun run verify:security-runtime
bun run verify:deploy
bun run verify:migrations
bun run verify:cache
bun run lint
bun run typecheck
SKIP_ENV_VALIDATION=1 bun run build
```

CI 还通过本地 PostgreSQL 服务运行 `smoke:security-migrations`，检查存量管理员、会话保留和新账号默认权限。行为回归脚本位于 `scripts/` 并纳入 CI，不依赖仅本地存在的 `tests/`。

只有显式设置 `SKIP_ENV_VALIDATION=1` 的验证 build 阶段会使用默认导航与 SEO 外壳；普通启动不会跳过环境或数据库角色校验，`0`、`false` 等值也不会开启跳过。现有无密钥 PR 构建只检查编译，不发布产物。正式发布流水线必须提供完整配置并读取真实构建数据，禁止设置该变量，不使用本地或 PR 验证产物。

发布后需要实际确认：正常管理员可登录、不同账号限流互不串联、无长度头的超大上传被拒绝、图片预览可见，以及公开文章原始 HTML/metadata/RSC 缓存边界符合既有 ISR 合约。代码及配置片段存在不代表线上 Nginx 已安装。

## 生产执行记录（2026-09-11）

本次仅实施服务器侧安全配置，生产发布目录仍为 `/var/www/fwqgo/releases/34070571168-1`。没有提交、推送代码、触发 Actions、切换发布目录或手工执行数据库迁移。

### 已实施

- Nginx 已安装并加载安全响应头、登录/注册限流、上传限流与 10 MB 请求体上限、浏览量接口限流。保留现有证书、CORS、缓存及其他代理参数，并检查了 `add_header` 的继承位置。
- `deploy/nginx/fwqgo-cloudflare-realip.conf` 已安装到 `/etc/nginx/conf.d/`。22 个可信 CIDR 来自核验过的 Cloudflare 官方列表；入口解析真实 IP 后覆盖 `X-Real-IP` 和 `X-Forwarded-For`，不向应用透传原始 `CF-Connecting-IP`。新增代理网段时需重新核验并更新该列表。
- 共享生产环境仅新增或调整 `HOSTNAME=127.0.0.1`、`TRUST_PROXY_HEADERS=true` 和 `ENABLE_BROWSER_SCRAPING=false`。两个应用逐个重载、逐个确认健康后保存 PM2 状态；仍使用原发布包的 Bun、fork 模式和每应用单实例。
- Web 进程已清除 CMS 写库变量、解密密钥与 Basic Auth 变量，保留只读库和独立埋点库，关闭后台 worker。CMS 写库、原密钥和原 worker 默认行为保留。两个进程及持久化环境中的 `SKIP_ENV_VALIDATION` 均为空。
- 已核对部署主机指纹、现有 `DEPLOY_KNOWN_HOSTS` Secret 与 `TRUST_PROXY_HEADERS=true` Variable，没有修改 GitHub 配置。通过临时 SSH 转发实测只读库可达且不能更新文章，验证后已关闭转发。

### 实际验收

- `nginx -t` 成功；Web/CMS 健康检查、公开首页和 CMS 登录页均为 HTTP 200。实际监听地址为 `127.0.0.1:3000` 和 `127.0.0.1:3100`。
- 12 次只读登录接口请求轮换伪造 IP 头，得到 6 次 405、6 次 429；20 次不存在文章的浏览量接口 GET 得到 16 次 405、4 次 429。没有 POST 登录、写入浏览量或锁定真实账号。
- 声明 11,000,000 字节的上传请求返回 413，未上传文件。该检查验证 Nginx 长度限制，不替代新应用代码上线后对无长度头、虚报长度和 multipart 实际字节数的测试。
- 唯一标记请求经过 Cloudflare 后，Nginx 日志记录的是非 CDN、非回环的客户端地址；未输出访客 IP 或其他访客日志。
- `bun run smoke:article-isr` 通过：最近 sitemap 文章 HTTP 200，原始 HTML 有 2,500 字正文，初始 head 中的 metadata、canonical、hreflang 及 resume segment ID 检查通过。额外跟随 RSC 同源跳转后得到 HTTP 200、`text/x-component` 和 `private, no-store, max-age=0`，未继承公共 HTML 缓存策略；这不代表已验证 CDN 缓存命中率。
- 与备份比较，CMS 密钥未变化。PM2 状态文件及敏感备份权限为 600，备份目录为 700。
- 已检查数据库角色权限和迁移基线：只读账号不能更新文章，埋点账号仅有浏览量字段写权限，CMS 账号可正常读写；三者均非 superuser。`drizzle.__drizzle_migrations` 有 69 条记录，最新为 `0068_public_slug_history`，`users.role/status` 尚未创建。无需补建基线或重跑旧迁移。

### 备份与剩余边界

服务器备份目录为 `/var/backups/fwqgo-security-20260911-TjueRm`，包含原站点配置、生产环境、PM2 状态、变更清单和逐应用环境恢复数据。需要回滚时按清单恢复对应配置，先执行 `nginx -t` 再加载 Nginx，应用按原环境逐个重载并检查健康；不要直接重跑本次维护脚本。备份含敏感数据，不得打印或提交到仓库。

RE2JS、鉴权缓存、应用层上传校验、权限字段、正式构建校验与构建隧道等代码尚未发布。`0069`、`0070` 仍待用户提交并推送 `main` 后由 GitHub Actions 执行。真实管理员登录、新应用的无长度头上传校验和浏览器图片预览仍需发布后验收；真实移动视口此前受 Chromium 启动限制，未验证。

本次没有轮换密钥、主动注销会话、修改业务数据或重启整机。PostgreSQL 仍保留既有公网监听、SSL 和客户端白名单，未修改其访问规则或启用防火墙；数据库网络收口需另行核对现有客户端后明确授权。
