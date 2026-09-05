# 公开文章 ISR 与 Cloudflare 缓存

更新日期：2026-09-05

## 运行模型

- Next.js 16.3.4 `cacheComponents` 与 `partialPrefetching` 同时启用。
- 构建时按语言分别预渲染最新文章和高浏览量文章，默认每种语言最多 50 篇。
- 未进入构建清单的已发布文章在首次访问后按需生成并进入 ISR 缓存。
- 文章正文、封面、标题 ID、TOC 和正文内链属于 15 分钟重验证、24 小时过期的核心缓存。
- 套餐价格和库存保持独立的 1 分钟 stale、5 分钟重验证、1 小时过期缓存及 Suspense 边界；浏览量继续由客户端 Beacon 统计。
- CMS 发布、编辑、封面、标签和内链操作通过 `post.changed`、`image.changed` 或 `taxonomy.changed` 主动失效 Next 缓存。
- 缓存重新生成超过 500ms 时记录结构化慢日志，文章日志拆分 `postReadMs`、`internalLinksReadMs`、`contentRenderMs`，套餐日志记录匹配查询耗时；可用 `PUBLIC_ARTICLE_SLOW_LOG_MS` 调整文章阈值（100–60000ms）。

`PUBLIC_ARTICLE_PRERENDER_LIMIT` 可设置为 1–100，默认 50。当构建环境没有可直连的生产数据库时（例如本地离线构建、PR 检查或 CI 独立构建环境），系统会优雅降级生成由 Web Proxy 明确返回 `404` 和 `X-Robots-Tag: noindex, nofollow, noarchive` 的保留校验参数。正式部署构建产物在服务器激活后由 ISR 自动按需生成并缓存真实文章。

部署工作流在构建产物 smoke 中验证静态壳、resume segment ID、首部元数据与缓存边界隔离；并在服务器激活后以 `bun run smoke:article-isr` 真实校验生产文章的 ISR 正文、元数据与缓存策略。

## Cloudflare Cache Rule

文章核心继续使用 ISR。应用不再按路径强制发出公开缓存头；外层 Nginx 根据最终 HTTP 状态和匿名文章资格标记设置缓存策略。完整配置见 [Search Console 整改记录](./search-console-remediation.md)。建议仅缓存以下请求：

```text
主机名等于 fwqgo.com
方法为 GET 或 HEAD
路径匹配 /fwq/posts/* 或 /en/fwq/posts/*
没有查询参数、Cookie 或 Authorization
响应为 200 HTML 且无 Set-Cookie
请求头不存在 RSC、Next-Router-Prefetch、Next-Router-Segment-Prefetch、Next-Router-State-Tree
```

规则必须绕过：

- `/api/*`、`/go/*` 和 CMS 域名；
- 带认证或会话 Cookie 的请求；
- 非 200 响应以及没有应用匿名文章资格标记的响应；
- RSC、路由预取和 segment prefetch 请求。

边缘 TTL 使用经过最终状态检查的 `CDN-Cache-Control`/`Cloudflare-CDN-Cache-Control`，freshness 为 900 秒，`stale-while-revalidate` 为 86400 秒。Nginx include 与 Cloudflare 规则需单独安装并复核；安装前整页 private/no-store 不影响文章核心 ISR。

Web 环境配置 `CLOUDFLARE_ZONE_ID` 与 `CLOUDFLARE_CACHE_PURGE_TOKEN` 后，已认证的内容缓存事件会异步清理受影响 URL，包含新旧 slug 和 sitemap；未配置时不调用 Cloudflare API。

## 部署后验收

对一篇构建清单内文章和一篇清单外文章分别执行：

```bash
curl -sS -D headers.txt https://fwqgo.com/fwq/posts/<slug> -o article.html
```

检查：

- `HTTP 200`、canonical 和 `index, follow`；
- 初始 `<head>` 中存在 title、description、canonical 和 hreflang；
- 热门文章原始 HTML 中直接存在可见 `<article>` 与 `.article-prose`，正文不位于 `[hidden]` 祖先下；
- 不存在重复 `S:*` resume segment ID；
- 外层规则启用后，无查询参数的匿名规范文档带 `s-maxage=900`；发布探针、RSC/预取、Cookie 请求及错误响应不带公开 HTML 缓存策略；
- 第二次请求逐步出现 `cf-cache-status: HIT` 或 `STALE`；
- 刷新、前进和返回过程中应用级控制台错误为 0。

文章整页不再使用 loading.tsx；套餐等辅助内容仍可单独流式加载。验收同时运行 `bun run smoke:public-seo --all`，并在外层缓存配置完成后用 `ARTICLE_ISR_REQUIRE_EDGE_CACHE=1` 启用严格的边缘策略检查。
