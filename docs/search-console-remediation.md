# Search Console 技术整改与验收

更新：2026-09-05。此文记录代码修复和发布后的验收边界，不代表 GSC 已刷新统计。

## HTTP 与文章缓存

- Web Node Proxy 在 PPR/流式 HTML 开始前检查文章、知识库、分类、标签、归档和服务器集合。缺失、未发布、正文不足、空 taxonomy 和越界页返回真实 404；读取异常返回 503 + `Retry-After: 60`。错误页只有 noindex，没有 canonical，所有缓存头均为 no-store。
- 两种语言的文章移除了整页 `loading.tsx`。标题、正文、TOC 和内链沿用 Cache Components；套餐仍处于独立 Suspense 边界。元数据等待同一份文章核心，正文不再位于隐藏的恢复节点中。
- 页码前导零、英文 taxonomy 旧别名、商家/地区/线路名称别名在进入页面前一次 301 到规范路径，保留查询参数。
- Next 配置不再按路径强制设置公开缓存头。无 Cookie、Authorization、查询参数和 RSC/预取头的规范文章响应可带 `X-Fwqgo-Cacheable-Article: 1`，这只是外层缓存的资格标记；最终状态、类型与 `Set-Cookie` 仍由 Nginx 检查。

## Slug 与迁移

`0068_public_slug_history.sql` 新增文章 `slugLocked`、历史地址表及事务内触发器。当前已发布文章自动锁定；退回草稿不会解锁。AI SEO 保留锁定地址，后台编辑页提供明确的“修改已发布地址”操作。

历史地址保存语言、旧 slug、当次新 slug、目标记录 ID 和时间。访问时读取目标的当前 slug，所以 A→B→C 后 A、B 均直接跳到 C。历史 slug 不可被另一记录占用；分类和标签的中英文改名也保留跳转。目标删除后返回 404。迁移不会猜测或重建此前已丢失的旧 slug。

迁移通过正常 GitHub Actions 发布流程执行。不得对现有数据库盲目重跑迁移；先核对 schema 与 `drizzle.__drizzle_migrations`。本轮不在生产执行迁移。

## 可索引规则

- 文章列表、详情、预渲染、sitemap、taxonomy 计数和发布校验统一要求：已发布、语言正确、标题/slug 非空、正文源文本至少 200 个字符。这是最低技术门槛，内容可信度与搜索意图仍需编辑审核。
- 分类至少三篇合格文章；标签还必须显式开启 indexable。Header、Footer、文章卡片、文章面包屑、正文标签和自动内链复用该规则。不达门槛的标签显示为文本。
- taxonomy 与归档仅第一页允许索引；有效深分页为 `noindex,follow`，用于浏览及发现文章，不放入 sitemap。越界页是 404。
- taxonomy 的双语 hreflang 只在两端均达到门槛时输出，head 与 sitemap 共用判断。
- `post_purchase_guide` 同时从知识库列表、详情、关联内容、hreflang 和 sitemap 排除。
- 服务器集合必须关联启用的规范实体，slug 为稳定 ASCII。名称/别名精确归一化；有歧义的名称或未映射的营销文本不生成集合页。
- `sitemap-core.xml` 收录首页与有内容的归档第一页。sitemap 内部与 HTTP TTL 均为一小时；taxonomy lastmod 计入相应语言的合格文章更新。数据 sitemap 保留运行时边界，避免离线构建固化空 XML。
- `apps/web/app/robots.ts` 仅转出公共 routes 的唯一实现；CMS 及购买短链的索引限制保留。

## 外层域名与缓存

`deploy/nginx/fwqgo-canonical-redirect.conf` 是现有 server 块的 include：放在 www 的 HTTP/HTTPS server 和裸域 HTTP server 中，沿用真实证书和监听配置；不要放入裸域 HTTPS 应用 server。它把完整 `$request_uri` 单跳 301 到 `https://fwqgo.com`。

应用也识别 `Host`/`X-Forwarded-Host` 的 www。若 Cloudflare 在请求到达源站前已经把 Host 改成裸域，需在 Cloudflare 最外层执行同一条 www 重定向；应用无法恢复被覆盖的域名。

缓存 include 分两层：

1. 在 Nginx `http {}` 中载入 `fwqgo-public-cache-maps.conf`。
2. 仅在现有中英文文章代理 location 中载入 `fwqgo-public-cache-headers.conf`，保留现有 proxy_pass、Host、超时等配置。
3. 映射只对资格标记为 1、GET/HEAD、无请求 Cookie/Authorization/RSC/预取/查询参数、最终 200 HTML 且无 Set-Cookie 的响应发出 900 秒共享缓存头；其他文章响应均 no-store。
4. 先 `nginx -t`，再按发布流程 reload。Cloudflare 只为同样的匿名规范 HTML 建缓存规则，非 200 TTL 为 0，保留 HTML/RSC 区分，不启用宽泛 Cache Everything。

这些 include 本轮仅准备在仓库中，尚未安装到线上。未安装时，Next 的整页响应可能仍为 private/no-store；文章核心 ISR 缓存继续工作。

如要在发布、改名或共享 taxonomy 变化时主动清理 Cloudflare URL 缓存，在 Web 服务环境配置 `CLOUDFLARE_ZONE_ID` 与仅有该 Zone 缓存清理权限的 `CLOUDFLARE_CACHE_PURGE_TOKEN`。已认证的缓存事件会在后台分批清理规范文章、历史地址与受影响 sitemap，不执行全站 Purge Everything。缺少配置时不调用外部 API；失败记录为 `public.edge_cache.purge_failed`。

## 验证命令

```bash
bun run verify:public-seo
bun run verify:cache
bun run verify:migrations
bun run lint
bun run typecheck
SKIP_ENV_VALIDATION=1 bun run build
SITE_URL=http://127.0.0.1:3000 bun run smoke:public-seo --all
SITE_URL=http://127.0.0.1:3000 bun run smoke:article-isr
bun run smoke:mobile
```

`smoke:public-seo` 检查浏览器与 Googlebot 的 404、规范页、sitemap 唯一 URL、hreflang 互惠、原始正文、301 查询参数及 RSC/Cookie 缓存边界。`SEO_EMPTY_CATEGORY`/`SEO_EMPTY_TAG` 可指定真实空 taxonomy slug；`SEO_MISSING_PATHS` 可提供未发布/正文不足等路径数组；`SEO_REDIRECTS_JSON` 可提供 `[旧路径, 规范路径]` 数组。在生产域名运行时还检查 HTTP、HTTPS www 到主域的单跳。

启用外层缓存后执行 `ARTICLE_ISR_REQUIRE_EDGE_CACHE=1 SITE_URL=https://fwqgo.com bun run smoke:article-isr`，要求无查询参数的规范文章发出 900 秒共享缓存策略。发布探针、RSC 与 Cookie 请求始终绕过共享 HTML 缓存。

`bun scripts/audit-public-seo-data.ts` 只读列出正文不足的已发布文章、文章集合高度重叠的标签及未映射套餐实体。标签合并需先审核搜索意图；报告中的“原生 IP”和“住宅 IP”等词不能仅凭文章重叠自动合并。历史 URL 还需结合 GSC 原因明细和访问日志复核。

## 本轮验证记录

- 使用 Bun 1.3.14 与 Node.js 24.15.0；最终 lint、typecheck、SEO/缓存/迁移/部署配置检查和 diff 空白检查均通过。
- Web 与 CMS 的生产构建通过；Web 最后一次构建包含保留原始重写地址的 `skipProxyUrlNormalize` 配置。中英文知识库公开首页为 200，内部渲染地址为 404。
- 在本地隔离 PGlite 数据上启动生产构建，`smoke:public-seo --all` 完成 116 次 HTTP 请求：43 个测试 sitemap URL 全部为 200、自规范、可索引，7 组别名重定向通过，浏览器与 Googlebot 两种 UA 均通过缺失资源检查。这些数量是测试数据，不是线上索引统计。
- 中英文文章原始 HTML 均有可见正文，未位于隐藏恢复节点中；发布探针与 RSC 不带公开 HTML 缓存策略。
- 额外验证了薄分类/薄标签、有效深分页的 noindex，以及文章卡片、正文标签、分类面包屑不输出薄 taxonomy 链接。
- 隔离数据库执行迁移并验证发布锁、退稿后继续锁定、连续改名、历史 slug 占用冲突，以及读取角色继承历史表 SELECT 权限。原生 PostgreSQL 测试进程启动被自动审批服务拒绝，因此未验证原生多连接并发行为。
- 数据库不可用的故障注入返回完整 503 + no-store + Retry-After。移除内链表的故障注入返回 500 + no-store 响应头，但该错误流正文读取发生超时；未将它记作完整响应通过。
- Cloudflare URL 清理使用模拟接口验证，覆盖限流重试、新旧地址、sitemap 与每批最多 30 个 URL，没有调用真实 Cloudflare 清理接口。
- `smoke:mobile` 因 Chromium 启动失败未完成；备用浏览器工具又被自动审批服务拒绝（审批模型接口不受支持）。真实视口未验证。
- 本轮没有提交、推送、部署或执行生产迁移。外层 www 规则、Nginx 缓存配置、Cloudflare 命中率及 GSC 实际结果仍需发布后验证。
