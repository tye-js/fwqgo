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

`PUBLIC_ARTICLE_PRERENDER_LIMIT` 可设置为 1–100，默认 50。使用 `SKIP_ENV_VALIDATION=1` 的本地和 PR 构建不会连接生产数据库，只生成一个由 Web Proxy 明确返回 `404` 和 `X-Robots-Tag: noindex, nofollow, noarchive` 的保留校验参数。正式部署构建具有只读数据库连接时才生成真实文章清单。

部署工作流以 `ARTICLE_ISR_REQUIRE_REAL_PRERENDER=1` 执行 built smoke；若任一语言的构建产物中没有至少一篇真实预渲染文章，会在打包和切换生产 release 前失败。本地 smoke 不设置该变量，因此允许仅验证保留参数和通用静态壳。

## Cloudflare Cache Rule

仓库只负责发出 HTML 缓存头，Cloudflare 控制台仍需建立 Cache Rule。建议仅缓存以下请求：

```text
主机名等于 fwqgo.com
方法为 GET 或 HEAD
路径匹配 /fwq/posts/* 或 /en/fwq/posts/*
查询参数不包含 _rsc
请求头不存在 RSC、Next-Router-Prefetch、Next-Router-Segment-Prefetch、Next-Router-State-Tree
```

规则必须绕过：

- `/api/*`、`/go/*` 和 CMS 域名；
- 带认证或会话 Cookie 的请求；
- 非 200 响应、`private` 或 `no-store` 响应；
- RSC、路由预取和 segment prefetch 请求。

边缘 TTL 使用源站的 `CDN-Cache-Control`/`Cloudflare-CDN-Cache-Control`，当前 freshness 为 900 秒，`stale-while-revalidate` 为 86400 秒。本阶段不配置 Cloudflare API Token，也不自动执行 Zone Purge：源站正常时内容通常在 15 分钟 freshness 到期后后台刷新；Cloudflare 在刷新期间是否以及多久继续提供 stale 内容，以实际 Cache Rule 和 Cloudflare 行为为准。

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
- 普通文档带 `s-maxage=900`，RSC/预取响应不带公开 HTML 缓存策略；
- 第二次请求逐步出现 `cf-cache-status: HIT` 或 `STALE`；
- 刷新、前进和返回过程中应用级控制台错误为 0。
