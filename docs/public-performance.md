# 公开站性能与知识库缓存

## 本次改动

- `/knowledge`、`/en/knowledge` 的默认列表通过内部渲染入口按需生成；公开网址、表单提交、canonical 和 hreflang 保持原样。
- `q`、`category`、`page` 参数仍走搜索/筛选页面，并维持 `noindex, follow`。包括空参数在内，均不会混入默认首页 HTML 缓存。
- 分类及数量、公开浏览列表使用 `use cache`，5 分钟重验证、1 小时过期。列表只接收已经解析的真实分类 ID 和有效页码；任意搜索词、不存在的分类和超界页码不会制造无界缓存条目。
- 默认列表复用已缓存的分类数量，避免每次访问先查 `COUNT` 再查列表。搜索继续执行独立查询。
- `knowledge.changed` 同时失效中文、英文、详情、列表数据和内部 ISR 路径；不得只清理对外首页路径而漏掉内部生成结果。
- 内部 `/knowledge/index-render/*`、`/en/knowledge/index-render/*` 直接访问返回真实 404、noindex 和 no-store，不进入 sitemap 或页面链接。
- `www` 重定向识别直接 Host 和反向代理保留的 `X-Forwarded-Host`，固定跳到 `https://fwqgo.com`，保留原路径及查询参数。

## Cloudflare 配置与上线验收

仓库修改不等于 Cloudflare 控制台配置已生效。应在代码部署后，用真实响应验证规则；不要把路径匹配本身当作成功 HTML 的证明。

### 主域名跳转

创建 Redirect Rule：

```text
http.host eq "www.fwqgo.com"
```

目标使用动态表达式 `concat("https://fwqgo.com", http.request.uri.path)`，状态码 301，开启保留查询字符串。验收 `/en/knowledge?q=CN2%20GIA&a=1&a=2` 只有一次跳转，路径、重复参数及编码保留。

### 默认知识库 HTML 缓存

Next.js Cache Components 缓存正文数据，但含 PPR 边界的完整文档仍可能默认返回 private。因此先在 Nginx 的 `http {}` 中载入 `deploy/nginx/fwqgo-knowledge-cache-maps.conf`，仅在两个首页的精确 location 中载入 `deploy/nginx/fwqgo-knowledge-cache-headers.conf`，保留现有 proxy_pass 和 Host 转发配置，并执行 `nginx -t`。

应用仅为无参数、无登录态、非预取的默认首页发出缓存资格标记。Nginx 同时检查最终 200 状态、HTML 类型及没有 Set-Cookie 后，才发出 300 秒边缘缓存和 60 秒 stale-while-revalidate；所有其他响应均 no-store。正文必需数据在初始 head 输出前读完，数据库失败不能变成一个可缓存的 200 空壳。

Cache Rule 的请求范围：

```text
http.host eq "fwqgo.com"
and http.request.method in {"GET" "HEAD"}
and http.request.uri.path in {"/knowledge" "/en/knowledge"}
and http.request.uri.query eq ""
and not any(http.request.headers.names[*] in {
  "cookie" "authorization" "rsc" "next-router-prefetch"
  "next-router-segment-prefetch" "next-router-state-tree"
})
```

Cloudflare 设置为允许缓存，并尊重经过上述状态校验的源站 Cache-Control；没有明确缓存策略时绕过。不要在 Cloudflare 用固定 Edge TTL 强制覆盖 `private` 或 `no-store`。CMS、API、带登录态、搜索、RSC、预取和失败响应不得缓存为公开 HTML。

每个语言首页至少请求两次，检查 200、可见正文、初始 head 元数据、合理的 `s-maxage`，随后确认 `cf-cache-status: HIT`。404/500、RSC、带 Cookie 和带参数请求必须仍然绕过公开缓存。静态资源已有的长期 immutable 缓存保持不变。

CMS 发布/编辑/撤稿首先失效 Next 缓存。仓库已有可选的 Cloudflare URL 清理入口，使用 `CLOUDFLARE_ZONE_ID`、`CLOUDFLARE_CACHE_PURGE_TOKEN` 配置后由缓存事件触发；不要把令牌写入仓库。未配置时，边缘内容只能等待 TTL/重验证，不能承诺撤稿即时在所有节点消失。

## 耗时定位

知识库分类、浏览列表及搜索分别记录 `Public knowledge query` 慢日志，字段包含 `operation`、语言、分类 ID、页码、`durationMs` 和失败状态。默认阈值 500ms，可通过 `PUBLIC_KNOWLEDGE_SLOW_LOG_MS` 调整到 100–60000ms。日志不记录搜索词、访客标识、SQL 或凭据；该耗时包含连接池等待和数据库往返，不能解释成纯 SQL 执行时间。

运行以下只读 HTTP 抽查：

```bash
PERFORMANCE_VANTAGE='本机网络' bun run audit:performance
```

结果写入 `output/performance/latest-http-audit.json`，包含 DNS、TCP、TLS、TTFB、响应接收、缓存命中、CF-Ray 和 Server-Timing。可用 `PERFORMANCE_SITE_URL`、`PERFORMANCE_PATHS`、`PERFORMANCE_RUNS` 指定目标、路径和 1–5 次采样。

这是单点、少量请求的诊断，不能当作真实用户 P75，也不能从中推算 FCP/LCP/INP/CLS。大陆三网及海外节点需分别执行，记录真实测试位置与网络。不要仅根据这份数据更换主机或购买加速服务。

## 统计口径与真实体验

- Cloudflare Web Analytics 先筛选公开站，CMS、内部测试和监控单独观察。
- 核对真实手机的 beacon 脚本与 `/cdn-cgi/rum` 请求是否成功。桌面占比极高、直接来源极高只是调查线索，不等同于机器人证据。
- 用源站日志对照时间、UA、ASN、访问频率和路径分布；确认异常行为后再设置相应限速，不按这份性能 PDF 批量封禁国家。
- FCP、LCP、INP、CLS 使用 Cloudflare Core Web Vitals，按国家、路径、设备和浏览器拆分。每次对比保留样本量，移动端只有个位数样本时不判断改善。
- 首阶段争取 FCP P75 降到 3 秒以内；长期参考 FCP ≤1.8 秒、LCP ≤2.5 秒、INP ≤200ms、CLS ≤0.1。发布后至少对比同口径 7 天，不用一次本地成绩替代真实用户数据。

## 验证命令

```bash
bun run verify:cache
bun run verify:knowledge
bun run verify:knowledge-nginx
bun run verify:public-mobile-ui
KNOWLEDGE_SMOKE_URL=http://127.0.0.1:3000 bun run smoke:knowledge
MOBILE_WEB_URL=http://127.0.0.1:3000 MOBILE_SMOKE_SCOPE=knowledge MOBILE_SMOKE_REQUIRE_DATA=1 bun run smoke:mobile
```

HTTP smoke 默认访问配置了 Nginx 响应策略的入口，检查可见 HTML、语言与元数据、搜索隔离、Cookie/RSC 绕过、内部入口 404 和 www 跳转。直接测试 Next 服务时可设置 `KNOWLEDGE_SMOKE_ORIGIN_ONLY=1`，只验证应用缓存资格，不代表 HTML 边缘策略通过。生产环境可加 `KNOWLEDGE_SMOKE_REQUIRE_EDGE_HIT=1` 强制要求 Cloudflare 命中。

移动端 smoke 实际运行 Chromium，覆盖 320、375、390、414、768、1024、1280px，中英文首页、分类筛选、返回默认首页及客户端错误。Chromium 不可用时必须明确报告“真实视口未验证”。

本次增加两个受保护的内部 ISR 路由入口，移动端路由哨兵从 26 调整到 28；对外页面网址未增加。

## 本地验证记录（2026-09-05）

- 前后台完整构建通过；本地构建使用不可连接的测试数据库地址，未依赖生产数据库。
- lint、TypeScript、知识库双语、缓存边界与路由哨兵检查通过。
- Bun 1.3.14 加独立 PostgreSQL 兼容测试库：两个语言首页预热后再次读取，新增数据库协议调用为 0；更新内容在失效后可见，撤稿后从列表移除，数据库故障返回 500/no-store，恢复后重新返回 200。测试库用于功能校验，不用于推断生产吞吐量。
- 源站模式 HTTP smoke 通过。Nginx 策略准备了真实进程验证脚本，覆盖 18 组请求/响应组合；本机沙箱禁止它读取 TCP 参数，沙箱外执行又被自动审批服务的模型配置错误拒绝，因此这项实测仍未完成。
- `smoke:mobile` 的 Chromium 启动失败，内置浏览器后备验证也被相同审批故障拒绝：**真实视口和客户端导航仍未验证**。
- 故障测试验证了响应状态和缓存头并取消错误响应体；Bun 下完整读取错误响应体曾超时，因此完整错误页面与线上反向代理行为仍需补验。
- Cloudflare 控制台、生产 Nginx 和大陆三网均未在本次修改中执行变更或实测。

## 性能修复记录（2026-09-11）

### 已安装到生产的 Nginx 策略

- 在 `http` 上下文安装文章和知识库缓存 maps；只为公开文章路径及两个默认知识库首页添加对应的缓存头。只有带应用资格标记、匿名、无参数、最终 HTTP 200、HTML 类型且没有 `Set-Cookie` 的响应才允许共享缓存。
- 文章策略为 `s-maxage=900`，知识库首页为 `s-maxage=300`；保留已有的 stale-while-revalidate 配置。Cookie、Authorization、RSC、预取、查询参数及错误响应仍为 no-store。首页、标签页、CMS、API 和静态文件没有被扩大成全站强制缓存。
- 修正两份 maps 中过长的字面量键。原配置在真实 Nginx 上报 `could not build map_hash`，改用对上一级生成结果的短正则匹配，无需调整全局 `map_hash_bucket_size`。
- 保留原有代理参数、可信 IP、安全头、证书、上传规则和 CMS 配置。Nginx 只做平滑重载，没有重启应用或切换发布版本。
- 先通过隔离 Nginx 的 42 组请求/响应组合，再通过 22 项线上私有/失败响应绕过检查。首次重载后的立即探测未观察到新策略，已自动回滚；随后增加新连接及新 worker 策略就绪检查，重新加载和验收成功。

备份：服务器 `/var/backups/fwqgo-performance-20260911-ojBHUw`。其中 `manifest.json`、`before-*`、`desired-*` 和 `applied.json` 记录精确文件及执行结果。恢复时按清单恢复旧文件，新文件移出生效目录，执行 `nginx -t` 后平滑重载并重新验收。不要直接重跑安装脚本。

### 本地代码修复，尚未发布

- 中英文首页使用有标签的渲染缓存，5 分钟重验证、1 小时过期，复用现有文章、套餐、推广位、标签和侧栏失效事件。
- 去除首页强制 `connection()` 与包住整个正文的 Suspense；先解析缓存正文再返回页面，使标题和文章卡片直接出现在原始 HTML 中。数据库错误继续抛出，只有显式数据库自由验证构建才不读取业务数据。
- 首页的 Cookie、Authorization、查询参数和 RSC/预取请求显式 no-store。Next ISR 的生命周期与 CDN 缓存资格分开验证，不以 HTTP `s-maxage` 推断内部缓存是否生效。
- 删除中英文文章整页 `loading.tsx`，修复真实数据预渲染时正文藏在恢复片段中的问题。两份文件均可从 Git 恢复；套餐与相关推荐原有的独立 Suspense 不变。
- 新增首页真实内容、原始 HTML 可见性、私有请求隔离及文章整页 loading 回归检查。无数据库的 smoke 明确只检查首页构建清单，完整内容与私有请求测试要求 `SMOKE_DATABASE_URL`；本轮已实际使用只读数据库跑过完整模式。HTTP 探针有明确超时，错误响应检查不强制等待可能尚未结束的流式错误正文。

### 验证与仍需完成的事项

- 通过已验证的 SSH 转发使用生产只读账号构建 Web，没有设置 `SKIP_ENV_VALIDATION=1`；实测该账号不能 UPDATE 文章。构建和预览未修改生产业务数据，连接凭据未写入文件，验证后关闭隧道和本地预览进程。
- 中英文首页真实预渲染分别包含 8 张文章卡片，可见 h1 不在 `[hidden]` 节点中；构建清单的重验证时间均为 300 秒。真实文章正文、初始 head metadata 和 resume ID 检查通过。
- 带真实只读数据库的 standalone smoke 通过；另在本地 Bun 预览中发送 `homepage.changed`，两个语言首页失效后仍返回 200 和真实文章卡片。该失效测试仅针对本地预览，Cloudflare 调用被显式禁用。
- 线上 `smoke:knowledge` 及严格文章缓存头/ISR 检查通过，Web/CMS 健康检查均为 200。
- 外网文章和知识库仍为 Cloudflare `DYNAMIC`，尚无边缘 HIT。生产进程未配置 `CLOUDFLARE_ZONE_ID` 与 `CLOUDFLARE_CACHE_PURGE_TOKEN`，当前也没有可用的 Cloudflare 管理连接。需要账号侧设置“允许缓存且尊重源站策略”的精确规则，并配置 URL 清理凭据；不得用固定 Edge TTL 覆盖 private/no-store。
- 尚不能承诺边缘即时失效或真实用户 P75 已改善。首页/文章代码仍需用户提交推送后由 GitHub Actions 发布；本轮未提交、推送、触发工作流或执行生产迁移。真实浏览器和大陆三网验收仍待补齐。
