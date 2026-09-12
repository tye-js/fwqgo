# 香港服务器 Nginx 配置

适用主机为 `103.117.136.139`（`ser283322661745`），Nginx 1.24，Web/CMS 分别监听 `127.0.0.1:3000`、`127.0.0.1:3100`。应用由 Bun 运行，Nginx 调整独立于应用发布。

## 配置分工

| 文件 | 安装位置和用途 |
| --- | --- |
| `deploy/nginx/fwqgo-http-tuning.conf` | `/etc/nginx/conf.d/`；上游连接池、普通/Upgrade 连接头、静态缓存映射、压缩及耗时日志格式 |
| `deploy/nginx/fwqgo-proxy.conf` | `/etc/nginx/snippets/`；HTTP/1.1 上游、5 秒连接超时、动态响应流式转发及安全头去重 |
| `deploy/nginx/fwqgo-proxy-headers.conf` | `/etc/nginx/snippets/`；覆盖 Host、真实 IP、转发协议，清除原始 Cloudflare IP 头 |
| `deploy/nginx/fwqgo-static-headers.conf` | `/etc/nginx/snippets/`；哈希静态资源长期缓存，错误响应 no-store，不缓存文件查找失败 |
| `deploy/nginx/fwqgo-site.conf` | 现有 `fwqgo.com` 站点文件；三个 HTTPS 主机的 HTTP/2、静态文件路径及规范域名单跳跳转 |

安装站点配置前必须保留原有 Cloudflare 可信地址、文章/知识库缓存 maps、安全头和登录/上传/浏览量限流片段。站点仍使用 Certbot 维护的证书及 TLS 配置，不修改证书文件。

`nginx.conf` 的全局连接配置采用 `worker_processes auto`、`worker_connections 4096`、`worker_rlimit_nofile 65536`，并关闭版本号输出、将全局 TLS 默认值限定为 1.2/1.3。当前 systemd 的文件描述符硬限制为 524288，支持该 worker 设置；不需要修改内核参数。

## 行为边界

- 每个 worker 最多保留 32 个 Web、16 个 CMS 空闲上游连接，空闲超时 4 秒。普通 HTTP 请求清除 Connection/Upgrade 头，只有实际 Upgrade 请求转发升级语义。
- 动态响应关闭代理缓冲，支持 Next.js PPR/RSC 和 SSE；请求体仍先缓冲，保留 8 KB 登录、10 MB 上传及现有其他请求体上限。
- `/_next/static/` 从 `/var/www/fwqgo/current/.next-web/static/` 或 `.next-cms/static/` 直接提供。哈希资源成功响应可缓存一年；缺失资源返回 404/no-store。`current` 软链接继续跟随发布工作流。
- HTML/JS/CSS/JSON/RSC 等文本由 Nginx 压缩，SSE 和已压缩图片、WOFF/WOFF2 不加入压缩类型。
- 文章与知识库首页继续校验资格标记、最终 HTTP 200、HTML 类型、无 Cookie/Authorization/查询/RSC/预取头及无 Set-Cookie。该配置不增加 Nginx 的页面磁盘缓存，也不修改 Cloudflare 缓存规则。
- 请求日志保留 combined 格式的原有字段，追加请求、上游连接、上游响应头和上游总耗时，不记录正文或认证头。

## 验证与操作

安装前先备份涉及的真实文件及软链接关系，保存修改前后的 SHA-256。先验证候选配置，安装后执行 `nginx -t`，成功后使用 `systemctl reload nginx` 平滑加载。检查新 worker 已出现，再对新连接验收；不要把重载后的首个旧连接当作新配置失败。

具备 Nginx 和 Bun 的环境可运行：

```sh
bun run verify:nginx-transport
bun run verify:knowledge-nginx
```

两个脚本只启动临时回环端口的 Nginx 和模拟上游，验证结束后关闭测试进程。第一项检查连接复用、可信请求头、压缩、静态资源、错误缓存和 SSE；第二项验证 42 组文章/知识库缓存及安全头组合。可通过 `NGINX_BIN` 和 `NGINX_POLICY_ROOT` 指定程序及配置目录。

上线验收应覆盖 Web/CMS 健康页、登录页、中英文文章和知识库、HTTP/2、静态文件内容校验、带 Cookie/RSC 的缓存绕过、规范域名跳转、上传上限及已有图片访问。回滚必须恢复本轮清单内的文件，通过 `nginx -t` 后平滑重载；不要切换应用发布目录或重新执行数据库迁移。

## 2026-09-12 生产执行记录

已安装 8 个相关配置文件并平滑重载。Nginx master PID 保持不变，8 个新 worker 的文件描述符软/硬限制均为 65536。Web/CMS 的 Bun PID 和发布目录 `/var/www/fwqgo/releases/34662829142-1` 保持不变。

- 真实隔离 Nginx 验证通过：3 次请求复用 1 个上游连接，SSE 首段在第二段发送前到达；静态压缩、安全头去重、可信转发头、404/no-store 和隐藏文件拒绝均通过。
- 原有文章/知识库缓存与安全头的 42 组组合通过。
- 完整候选配置和生产配置各通过 43 项 HTTP 检查：两个应用健康页、登录页、中英文正文与知识库、HTTP/2、Cookie/Authorization/RSC/查询参数绕过、静态文件内容、404、域名跳转和 413 上传上限。
- 外网首页及 CMS 登录页返回 HTTP 200；`http://www.fwqgo.com` 单跳到规范 HTTPS 域名，并保留路径与参数。
- 在两个域名抽检已有上传图片，均返回 HTTP 200，响应字节与磁盘文件一致，原有图片访问规则保持正常。
- 严格文章 ISR smoke 通过：最近 sitemap 文章的 2500 字正文在原始 HTML 中可见，初始 head 元数据、canonical、hreflang 和恢复片段 ID 正常；规范文章保留 `s-maxage=900`，发布探针及 RSC 不带公共 HTML 缓存策略。
- 耗时日志已生效，真实静态资源请求的上游耗时字段为 `-`，确认由 Nginx 直接提供。隔离验证进程已关闭。

备份目录：服务器 `/var/backups/fwqgo-nginx-20260912-zbdy6g0q`，权限 700。`manifest.json` 记录文件路径、原权限、原内容及目标内容的 SHA-256；`before-*`、`desired-*` 保存可恢复副本。`applied.json`、`verified-candidate.json`、`verified-production.json` 和 `final-state.json` 保存执行及验收结果。

该主机没有 IPv6 回环地址 `::1`，隔离 HTTP 验收使用 IPv4 回环；生产保留 IPv6 监听。Cloudflare 规则未改变，当前外网 HTML 为 `DYNAMIC`，以上结果不代表 CDN 命中率或用户端延迟的压测结论。
