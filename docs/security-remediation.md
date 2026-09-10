# 安全修复与发布检查

本轮按未发生密钥泄漏处理，保留现有账号和会话，不轮换 AI、供应商或缓存刷新密钥。

## 已落实的行为

- 出站 HTTP 使用安装包的 `undici/index.js`，在 Bun 1.3.14 与 Node 24 中绑定已验证的 DNS 地址；每一跳重新验证，跨域跳转移除认证头。IPv6 使用二进制网段判断，拒绝内网、映射、NAT64、6to4、Teredo 与保留地址。
- CMS 登录始终按账号限流，有可信 IP 时再增加 IP 配额。生产只接受受信入口覆盖的 `X-Real-IP`，不回退到客户端可控的转发头。浏览量请求没有可信 IP 时不写数据库。
- `0069` 保持已有账号的后台权限；`0070_default_new_users_to_viewer.sql` 将新账号默认权限改为 `viewer`。登录与会话检查均要求 `active admin`。公开注册默认关闭，打开后也只能创建 viewer，管理员授权需单独明确执行。
- Web 环境不持有 CMS 解密主密钥及 Basic Auth 密码；Cloudflare 缓存清理 Token 保留给实际执行清理的 Web 接口。生产读库和埋点库缺少独立 URL 时启动失败。
- 上传先累计检查整个 multipart 请求的实际字节数，上限 10 MB，再解析表单；单图上限仍为 8 MB。无长度头、虚报长度与额外字段均受总量限制。
- HTML 字段正则使用 RE2，最多 200 字符，单字段匹配输入最多 64 KB。保存、预览和执行前均检查语法；回溯引用和前后向断言会返回配置错误，不降级到 JavaScript RegExp。
- 首页、分类、SEO 和套餐核心缓存遇到数据库错误时抛出异常，避免把故障写成空的成功结果。
- CMS CSP 允许本地 `blob:` 图片预览；开发模式允许 HMR，不启用 HTTPS 升级和 HSTS。正式环境保留禁止嵌入等安全头。Next.js 当前内联启动脚本仍需要 `unsafe-inline`，这不是完整的 nonce CSP。

## 发布前必须完成

1. 在可信服务器控制台或现有已验证连接中取得 SSH 主机公钥，并独立核对指纹。把匹配 `DEPLOY_HOST` 与端口的完整 known_hosts 行保存为 GitHub Secret `DEPLOY_KNOWN_HOSTS`。非 22 端口的主机字段需要 `[host]:port`，不能只填 `SHA256:...` 指纹。
2. 安装 `deploy/nginx/fwqgo-security-rate-zones.conf` 到 Nginx 的 `http` 上下文。把其余安全片段放到 `/etc/nginx/snippets/`，在现有 HTTPS server 中分别引入 CMS、公开浏览量限制和安全响应头片段。所有代理 location 都要覆盖 `fwqgo-proxy-headers.conf` 中的请求头；若现有 location 定义过代理头，需要逐项检查继承关系。不要重复创建同路径的 location。自定义端口要同步调整 upstream。
3. 使用 Cloudflare 等上游代理时，仅对其真实、经过核验的 CIDR 设置 `set_real_ip_from`，再设置对应 `real_ip_header`；不得信任所有来源。检查源站入口和防火墙，避免所有用户被识别为同一 CDN 地址。运行 `nginx -t` 后按现有运维流程加载配置。
4. 确认 Nginx 已覆盖真实 IP 后，把 GitHub Variable `TRUST_PROXY_HEADERS` 设置为 `true`。CI 会合并该值，且在切换版本前检查运行配置。两个 PM2 应用绑定 `127.0.0.1`，通过反向代理访问。
5. 常规部署由用户提交并推送 `main` 后交给 GitHub Actions。发布包包含 `0069` 与 `0070`，由已有生产迁移步骤执行。上线前仍需确认生产 schema 和 Drizzle 迁移记录一致，不手工重跑已有迁移。

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

只有显式设置 `SKIP_ENV_VALIDATION=1` 的本地 build 阶段会使用默认导航与 SEO 外壳；该开关在普通运行阶段不会把数据库失败转换为空数据。正式发布由 CI 在完整生产环境下构建，不使用本地验证产物。

发布后需要实际确认：正常管理员可登录、不同账号限流互不串联、无长度头的超大上传被拒绝、图片预览可见，以及公开文章原始 HTML/metadata/RSC 缓存边界符合既有 ISR 合约。代码及配置片段存在不代表线上 Nginx 已安装。
