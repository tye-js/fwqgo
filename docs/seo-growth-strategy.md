# fwqgo 自然搜索增长策略

更新：2026-09-19。基于对线上站点（fwqgo.com）的实测抓取 + 仓库代码审查。

本文件是**可执行清单**，每一项都标注了证据、落点文件和验收标准。诊断的完整叙述见 `output/seo-audit-report.html`。

---

## 0. 现状基线（实测数据，2026-09-19）

| 维度                  | 实测值                 | 判断             |
| ------------------- | ------------------- | -------------- |
| 可索引 URL 总数          | 485                 | 偏小，且结构失衡       |
| 中文文章                | 193                 | 尚可             |
| 英文文章                | 60（31%）             | 覆盖不足           |
| 分类页                 | 15                  | 合理             |
| **标签页**             | **150**             | **膨胀，占全站 31%** |
| 服务器聚合页              | 5                   | **严重不足**       |
| 知识库页                | 54                  | 方向正确但断链        |
| 首页 TTFB             | 1.27 s              | 差（目标 < 0.4 s）  |
| 首页 cache-control    | `private, no-store` | 完全不可缓存         |
| cf-cache-status     | `DYNAMIC`           | 无边缘缓存          |
| 首页未压缩 HTML          | 563 KB              | 偏大             |
| `/servers` 未压缩 HTML | 781 KB              | 偏大             |
| 搜索引擎验证标记            | 无                   | **无法度量**       |
| GA / GTM            | 无                   | **无法度量**       |
| RSS / Atom          | 404                 | 缺内容分发通道        |

**技术底座评级 A-（2026-09-05 整改成果）**：robots、sitemap index、canonical、hreflang 互惠、JSON-LD（BlogPosting / BreadcrumbList / ItemList / FAQPage / Product+Offer）、404/503 语义、深分页 `noindex,follow`、`/search` noindex、历史 slug 301 —— 这些都已正确。

**结论：流量不足不是技术缺陷导致的，而是「度量缺失 + 信任缺失 + 商业着陆页缺失 + 内容结构失衡」四重问题。**

---

## P0-1 补齐度量能力（一切的前提）

**证据**：首页 HTML 中 `google-site-verification`、`msvalidate`、`googletagmanager`、`gtag(` 均为空；`src/env.js` 无相关变量；`/feed.xml` `/rss.xml` `/atom.xml` 全部 404。

**问题**：当前"流量不足"是主观判断。没有 GSC 就无法回答：收录了多少页、哪些词有曝光、哪些页有曝光但 CTR 低、哪些页排名 8-20 位（最值得优化）。

**行动**：

1. Google Search Console 验证（建议 DNS TXT，避免占用 HTML head），提交 `https://fwqgo.com/sitemap.xml`（会自动展开 8 个子图）。
2. Bing Webmaster Tools（支持从 GSC 一键导入）。
3. 安装分析：GA4 或 Cloudflare Web Analytics（后者无 Cookie，不触发同意横幅）。
4. 新增 RSS/Atom feed，落点 `src/features/public/routes/feed.xml/route.ts`，并在 `<head>` 加 `<link rel="alternate" type="application/rss+xml">`。
5. 建立月度基线报表：收录数、曝光、点击、平均排名、Top 20 词、CTR < 2% 的高曝光页。

**验收**：GSC 显示已发现 URL 数 ≥ 450（当前 sitemap 485 条），并有一份可对比的月度数据。

---

## P0-2 首页与英文首页 title 重写（最快见效）

**证据**：

- `https://fwqgo.com/` → `<title>服务器go</title>`
- `https://fwqgo.com/en` → `<title>fwqgo</title>`

**问题**：首页是全站内链权重最高的页面，title 却只放品牌名。首页 description 写得很好（含"VPS、云服务器、独立服务器、原生IP"），但 title 完全不承接关键词，等于把最强的排名资源浪费掉。品牌名"服务器go"本身几乎没有搜索量。

**行动**（`src/features/public/routes/` 下首页的 `metadata`）：

- 中文首页：`服务器go - VPS优惠与服务器评测｜香港/美国/日本VPS推荐`
- 英文首页：`fwqgo - VPS Deals, Server Reviews & Hosting Comparisons`
- 同时检查 `/fwq/page/1`（文章归档首页）title 是否与首页重复 —— 两者应分工：首页打品牌+品类词，归档页打"全部文章/最新优惠"。

**验收**：首页 title 长度 30-60 字符，含 2 个以上目标关键词，且与归档页不重复。

---


## P0-3 建立 E-E-A-T 信任体系（联盟站生死线）

**证据**：

- `/about` `/contact` `/privacy` `/terms` `/disclaimer` `/about-us` **全部 404**。
- 页脚只有内容链接（`/knowledge`、`/servers`、`/fwq/page/1`、`/tools/*`），无任何信任链接。
- 文章 JSON-LD：`author: {"@type":"Person","name":"服务器go"}` —— 用品牌名冒充人名；`publisher` 只有 `name`，缺 `url` / `logo`。
- 数据库其实有 `posts.authorId → users` 外键（`packages/db/schema.ts:47`），但前端从未使用。

**问题**：这是一个**以联盟推荐变现**的站点（`/go/[token]` 购买跳转、`serverOffers` 套餐）。Google 近几轮核心更新专门打击「无主体、无作者、纯导购」的站点。缺 About/Contact/隐私政策 = 无法确认谁在推荐、为什么可信。这是当前**最可能压制整站排名的因素**。

**行动**：

1. 新建 5 个静态页：`/about`（团队与编辑方针）、`/contact`、`/privacy`、`/terms`、`/affiliate-disclosure`（联盟营销披露，中国《广告法》与 FTC 均要求）。
2. 文章页展示真实作者署名，链接到作者页 `/authors/[slug]`，输出 `Person` schema（含 `sameAs` 指向社交/专业主页）。
3. JSON-LD 的 `publisher` 补 `url` + `logo`（`ImageObject`，建议 512×512 PNG）。
4. 页脚新增信任链接组（关于 / 联系 / 隐私 / 条款 / 联盟披露）。
5. 作者体系落点：`packages/db/schema.ts` 的 `users` 表已有基础，需补 `bio`、`avatarUrl`、`sameAs` 字段与对应迁移。

**验收**：5 个信任页全部 200 且可索引；文章页出现作者署名与作者页链接；Rich Results Test 通过 `Person` + `Organization`。

---


## P0-4 补齐商业聚合页（最大流量机会）

**证据**：

- `sitemap-servers.xml` 只有 **5 条**：`/servers`、`/servers/hong-kong`、`/servers/united-states`、`/servers/cheap-vps`、`/servers/providers/racknerd-16`。
- `/servers/regions/hong-kong` → **404**、`/servers/lines/cn2` → **404**。
- 路由代码存在（`src/features/public/routes/servers/{regions,lines,providers}/[x]/page.tsx`），但 `getServerOfferCollection` 在 `resolvePublicServerEntity` 找不到实体时返回 `null` → `notFound()`。
- 判定阈值：`server-offers.ts:457` 的 `indexable: offers.length >= MIN_INDEXABLE_SERVER_COLLECTION_OFFERS`。
- `scripts/audit-public-seo-data.ts` 已经在检测「未映射套餐」：`regionId IS NULL AND region IS NOT NULL` 等三种情况。

**问题**：「香港服务器」「美国VPS」「CN2 GIA」「CMIN2」「9929」「双ISP」「原生IP」这些是**最高商业意图**的关键词，站点却没有任何着陆页。这是投入产出比最高的一块。

**行动**：

1. 跑 `bun scripts/audit-public-seo-data.ts` 取未映射套餐清单，补齐 `serverOffers.regionId / lineId / providerId`。
2. 优先映射目标（按商业价值排序）：
   - 地区：香港、美国、日本、韩国、新加坡、英国、德国、马来西亚
   - 线路：CN2 GIA、CN2 GT、CMIN2、AS9929、CMI、BGP、双ISP、原生IP
   - 商家：所有在架商家
3. 每个聚合页补 **300 字以上独有导语** + 3-5 条 FAQ（`FAQPage` schema 已支持）。当前 `/servers/hong-kong` 的 title 质量很高（"香港服务器优惠套餐对比：CN2、CMI、BGP VPS 与独立服务器"），可作模板。
4. 修正 provider slug：`racknerd-16` 的 `-16` 数字后缀无意义；title `racknerd服务器优惠套餐` 应为 `RackNerd 优惠套餐与评测｜洛杉矶/圣何塞 VPS`。
5. 把这些聚合页加入首页/文章页的显式内链。

**验收**：region 页 ≥ 8、line 页 ≥ 6、provider 页 ≥ 20，全部在 `sitemap-servers.xml` 中且 `index,follow`。

---

## P1-5 性能与爬取效率

**证据**：

- TTFB：`/` 1.27 s、文章页 1.30 s、`/servers` 1.45 s。
- 响应头：`cache-control: private, no-cache, no-store, max-age=0, must-revalidate` + `cf-cache-status: DYNAMIC`。
- 文章与知识库首页的缓存 include 已于 2026-09-12 上线（`docs/nginx-optimization.md` 的生产执行记录），但只覆盖文章 location 与知识库首页，首页与 `/servers` 仍落在 `location /` 上，没有任何共享缓存策略。
- `cf-ray: ...-AMS` —— 请求落在阿姆斯特丹节点，对中文用户 RTT 偏高。

**问题**：TTFB 直接抬升 LCP；`no-store` 让每次请求都回源，既伤用户体验也降低爬取预算利用率。

**行动**：

1. 按 `docs/search-console-remediation.md` 的步骤上线 Nginx 缓存 include：`deploy/nginx/fwqgo-public-cache-maps.conf`（`http {}` 层）+ `fwqgo-public-cache-headers.conf`（文章 proxy location）。先 `nginx -t`，再 reload。
2. 配置 `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_CACHE_PURGE_TOKEN`，启用边缘缓存与主动清理。
3. **把首页与 `/servers`、分类/标签页也纳入缓存规则** —— 当前 include 只覆盖文章 location，而首页恰恰是最慢的。
4. Cloudflare 侧检查节点调度，让中文用户落到香港/新加坡/日本 POP。
5. 评估首页 RSC payload 内联体积（563 KB / 781 KB），把非首屏模块改为客户端懒加载。

**验收**：`ARTICLE_ISR_REQUIRE_EDGE_CACHE=1 SITE_URL=https://fwqgo.com bun run smoke:article-isr` 通过；`cf-cache-status: HIT`；TTFB < 400 ms；CrUX / PageSpeed 移动端 LCP < 2.5 s。

> **进度（2026-09-19）**：第 3 步的 Nginx 侧已上线。
>
> - 第 1 步本就不需要重做 —— 文章与知识库的 include 已在 2026-09-12 安装，`deploy/nginx/fwqgo-public-cache-maps.conf` 与 `fwqgo-public-cache-headers.conf` 已经在线，文档里「尚未安装到线上」是 09-05 的旧结论。
> - 第 3 步完成：`fwqgo-public-page-cache-headers.conf` + public page maps + `fwqgo-site.conf` 的 5 个新 location（`= /`、`= /en`、`= /servers`、`^/servers/`、分类/标签/归档正则）已安装并平滑重载。原有 robots / sitemap / feed / 知识库 / 文章策略与点文件拦截实测未变，新 location 的安全头已重挂。
> - 仍未生效：这些 location 需要 `apps/web/proxy.ts` 发出的 `X-Fwqgo-Cacheable-Public` 标记随应用发布上线；在此之前对外是 `no-store`，行为与改动前等价。
> - **第 2 步是当前瓶颈**：实测文章页在已有 900 秒公共策略的情况下 `cf-cache-status` 仍是 `DYNAMIC`，说明 Cloudflare 从未缓存 HTML。必须建 Cache Rule 才会出现 `HIT`；主动清理另需 `CLOUDFLARE_ZONE_ID` 与 `CLOUDFLARE_CACHE_PURGE_TOKEN`。这一步需要 Cloudflare 账号权限，代码侧无法代办。
> - 第 4 步无需处理：`cf-ray` 实测已落在 `HKG` 节点。

---


## P1-6 标签页瘦身与 URL 质量

**证据**：

- 150 个标签页 vs 193 篇文章 —— 标签页占全站可索引 URL 的 **31%**。
- **101 / 150 个标签 slug 是中文百分号编码**，例如 `/fwq/tags/%E6%B5%81%E5%AA%92%E4%BD%93%E8%A7%A3%E9%94%81vps/page/1`（= 流媒体解锁vps）。英文侧却是 `native-ip`、`dual-isp`、`kvm-vps`。
- 标签页 title 只是 `KVM VPS - 服务器go`；description 是模板句「KVM VPS相关的服务器优惠、评测与选购文章。」
- 标签页 HTML 556 KB，但只链出 16 篇文章 —— 内容极薄。
- 抽样重复度：`kvm-vps` 与 `nvme-vps` 的文章集合 Jaccard = 0.37（中等重叠）。

**问题**：150 个低价值列表页会摊薄整站质量评分，且中文编码 slug 在 SERP 中不可读、影响 CTR 与外链可传递性。

**行动**：

1. **slug 改 ASCII**：给中文标签生成英文/拼音 slug（`流媒体解锁vps` → `streaming-unlock-vps`）。旧 slug 通过已有的 `publicSlugRedirects` 机制 301，无需担心失效。
2. **提高 `indexable` 门槛**：从「≥3 篇」提升到「≥5 篇 **且** `description` 长度 ≥ 80 字」。落点 `scripts/audit-public-seo-data.ts` 的 `having(count(*) >= 3)` 与 `server-offers.ts` 同族判定。
3. **合并语义重叠标签**：`流媒体解锁vps` / `流媒体解锁`、`低价vps` / `便宜vps`、`原生ip服务器` / `原生ip-vps`。注意 `docs/search-console-remediation.md:66` 已警告：合并前必须人工审核搜索意图，"原生 IP"与"住宅 IP"不可自动合并。
4. **标签页补独有导语**：150-300 字，说明这个标签覆盖什么、适合谁。可用 CMS 批量生成初稿 + 人工审核。
5. 目标：可索引标签从 **150 → 40-60**。

**验收**：`sitemap-tags.xml` URL 数下降 ≥ 50%；所有标签 slug 为 ASCII；抽检 10 个标签页有独有导语。

---

## P1-7 干净 URL 404 问题

**证据**：

```
/fwq/cheap-vps                  → 404
/fwq/tags/kvm-vps               → 404
/fwq/cheap-vps/page/1           → 200（canonical 指向此）
/fwq/tags/kvm-vps/page/1        → 200（canonical 指向此）
```

**问题**：`/page/1` 被当作规范 URL，导致"干净 URL" 404。后果：(a) 任何指向 `/fwq/cheap-vps` 的自然外链、分享链接、用户手输地址全部失效，丢失外链权重；(b) Google 更倾向索引不带 `page/1` 的 URL，会自己改写或产生冗余。

**行动**：把干净 URL 作为 200 + canonical，`/page/1` 301 到干净 URL。需同步修改三处：`publicSlugRedirects` 的规范化逻辑、sitemap 生成（`src/features/public/routes/sitemaps`）、`smoke:public-seo` 断言。

**验收**：`/fwq/cheap-vps` 与 `/fwq/tags/kvm-vps` 返回 200 且自 canonical；`/page/1` 单跳 301。

---

## P1-8 内链：知识库断头路

**证据**：

- `/knowledge` 首页：18 条知识条目链接，**0 条文章链接**。
- `/knowledge/server-selection-by-use-case`：内链文章 **0** 条，内链知识 6 条，正文 1762 字。
- 反向：文章页内链丰富（`relatedPostLinks` + `internalLinks.relatedKnowledge` + `matchedTopics` 专题），且指向 `/servers/*`。

**问题**：知识库是典型的信息型 Top-of-funnel 内容（"怎么选服务器"），本应把权重和用户导向商业页，但它是**死胡同**。54 篇知识库内容完全不参与转化路径。

**行动**：

1. 知识库详情页底部新增「相关套餐」与「相关文章」模块，按标签/场景匹配。
2. 把文章正文的自动内链规则（`src/server/posts/internal-links.ts`）扩展到知识库→文章的出链。
3. 每个知识条目至少 3 条出链：1 个商业聚合页 + 2 篇文章。
4. 文章 → 知识库 → 聚合页 形成闭环，避免只有"文章→聚合页"的单层结构。

**验收**：抽检 10 个知识条目，每个至少有 1 条商业页出链 + 2 条文章出链。

---

## P1-9 内容结构与发布节奏

**证据**（按 sitemap `lastmod` 统计）：

| 月份      | 中文文章    | 英文文章 |
| ------- | ------- | ---- |
| 2026-06 | **132** | 0    |
| 2026-07 | 22      | 22   |
| 2026-08 | 19      | 17   |
| 2026-09 | 20      | 21   |

**问题**：

1. **68% 的文章集中在 2026-06 单月发布** —— 这是批量导入/采集的典型特征，Google 会降低整站信任度，且这批文章很可能从未获得排名。
2. 之后节奏断崖式下跌到每月 ~20 篇。
3. 内容类型高度单一：抽样 `dedione-los-angeles-cn2-gia-cmin2-vps`、`uqidc-2026-zhongqiu-vps-sale`、`v-ps-tokyo-5th-anniversary-premium-network-guide` 全部是**商家促销文**（品牌词）。品牌词的搜索者是已知品牌的导航型用户，增量极小。

**行动**：

1. **稳定节奏**：每周 3-5 篇，持续 3 个月。持续产出是 Google 判断站点活跃度的最强信号之一。
2. **补需求词内容**（这是真正的增量池）：
   - 对比型：`CN2 GIA 和 CMIN2 有什么区别`、`香港VPS vs 日本VPS 怎么选`、`KVM 和 OpenVZ 的区别`
   - 决策型：`2026 便宜VPS推荐`、`建站用什么VPS`、`流媒体解锁VPS推荐`、`跨境电商用什么服务器`
   - 问题型：`VPS 被墙了怎么办`、`VPS 流量超了会怎样`、`VPS 和云服务器区别`
   - 商家评测型（已有）：保持并补充
3. **存量审计**：对 6 月那批 132 篇做质量分级。低质/重复的合并或 `noindex`，有价值的补更新日期与内链。用 `bun scripts/audit-public-seo-data.ts` 先出清单。
4. 建立内容日历，把"商家促销文"控制在 50% 以内。

**验收**：连续 4 周每周新增 ≥ 3 篇；需求词内容累计 ≥ 25 篇。

---

## P2-10 结构化数据补全

**证据**：

- 首页 JSON-LD 块数 = **0**。
- 文章页 `BlogPosting` 缺 `author.sameAs`、`publisher.url`、`publisher.logo`。

**行动**：

1. 首页补 `WebSite` + `SearchAction`（可触发 SERP 站内搜索框）+ `Organization`（`logo`、`url`、`sameAs`）。
2. `BlogPosting` 的 `publisher` 补 `logo`（`ImageObject`）与 `url`。
3. 知识库页补 `Article` 或 `HowTo`（选型类内容很适合 `HowTo`）。
4. 聚合页的 `Product` + `Offer` + `FAQPage` + `BreadcrumbList` 已经正确，保持。

**验收**：Rich Results Test 对首页、文章页、聚合页、知识库页四类模板全部无错误。

---

## P2-11 英文站扩张

**证据**：英文文章 60 篇 = 中文的 31%；英文知识库 27 条；`/en` 首页 title 只有 `fwqgo`。

**问题**：英文侧是**竞争度更低**的增量池（"Hong Kong VPS"、"VPS deals" 的竞争远低于中文同类词），但覆盖率不足。

**行动**：

1. 优先翻译：商业价值高的文章 + **全部聚合页** + 知识库补齐。
2. 英文聚合页尤其重要 —— `Hong Kong VPS`、`CN2 GIA VPS`、`Residential IP VPS` 是英文市场的真实搜索词。
3. 英文侧同样需要独立的需求词内容（"How to choose a VPS for streaming"）。
4. 注意：英文翻译使用独立 slug（如 `...-en-284`），中文 slug 仅作 `hreflang` alternate。这是已确认的设计，不要改动。

**验收**：英文文章覆盖率 ≥ 60%；英文聚合页与中文数量对齐。

---

## P2-12 外链与权威度

**证据**：仓库与线上均未见任何外链建设痕迹。

**行动**：

1. **工具型内容获取自然外链**：`/tools/server-sizing`、`/tools/network-lines` 已存在，把它们做成可被引用/嵌入的资源（提供结论分享、结果链接）。
2. **数据报告**：发布「2026 海外 VPS 价格指数」「香港机房延迟实测榜」这类原创数据，天然被引用。
3. **社区参与**：Hostloc、V2EX、Reddit r/VPS、LowEndTalk 等社区，以真实内容参与并自然引用。
4. **商家侧互链**：与商家合作页面互换链接。

---

## 执行路线图

### 第 1 周 — 速赢（无需重构）

- [x] P0-2 首页 / 英文首页 title 重写
- [x] P0-3 新建 5 个信任页 + 页脚信任链接组（作者体系除外，见 P0-3.2）
- [x] P2-10 首页 JSON-LD（WebSite + Organization + SearchAction）
- [x] P0-1.4 新增 `/feed.xml` + `<head>` 里的 `rel="alternate"`（RSS 通道）
- [ ] P0-1.1-1.3 / 1.5 GSC + Bing 验证、装分析、月度基线报表 —— **需要你的账号，代码侧无法代办**

> 2026-09-19 落地记录：`src/features/public/lib/trust-pages.ts`（5 份文档，中英各一套）、
> `about-page.tsx`、`trust-document-page.tsx`、`site-structured-data.ts`、
> `src/features/public/routes/feed.xml/route.ts`。新增守卫 `bun run verify:trust-pages`
> 已挂进 `bun run check`：校验 5 个 slug × 2 语言的落盘路由、页脚与移动端导航的覆盖、
> 以及信任页内所有根相对链接是否指向真实路由。

### 第 2-3 周 — 结构

- [ ] P1-5 Nginx 缓存上线 + Cloudflare 边缘缓存 + 首页纳入缓存 —— **Nginx 侧 2026-09-19 已完成**（新增首页 / `/servers` / 分类 / 标签 / 归档 5 个 location），待应用发布带上资格标记后生效；**Cloudflare Cache Rule 仍缺，需要账号权限**
- [ ] P0-4 聚合页实体映射补齐（region / line / provider）
- [ ] P1-7 干净 URL 200 化
- [ ] P1-6 标签 slug ASCII 化 + 门槛提升 + 合并

### 第 4-8 周 — 内容

- [ ] P1-8 知识库 → 商业页内链闭环
- [ ] P1-9 需求词内容 25 篇
- [ ] P1-9 6 月存量 132 篇质量审计与合并
- [ ] P0-3 作者体系 + 作者页

### 第 2-3 月 — 权威

- [ ] P2-11 英文内容扩张至 60%
- [ ] P2-12 数据报告 + 外链建设
- [ ] 月度 GSC 复盘，迭代

---

## 关键指标（月度跟踪）

| 指标      | 当前     | 3 个月目标     | 6 个月目标  |
| ------- | ------ | ---------- | ------- |
| 可索引 URL | 485    | 500（结构优化后） | 800+    |
| 服务器聚合页  | 5      | 35+        | 60+     |
| 可索引标签页  | 150    | 50         | 40      |
| 英文覆盖率   | 31%    | 50%        | 70%     |
| TTFB    | 1.27 s | < 0.4 s    | < 0.3 s |
| GSC 收录率 | 未知     | > 90%      | > 95%   |
| 自然点击    | 无基线    | 建立基线       | 翻倍      |

---

## 不要动的东西（已确认的正确设计）

排查时勿误判为缺陷，详见工作区记忆 `MEMORY.md`「已确认的设计」：

- 英文翻译使用独立 slug（中文 slug 拼 `/en/...` 得 404 是正常的）。
- `cf-cache-status: DYNAMIC` 的根因是 Cloudflare 凭据未配置，属可选设计 —— 但**本策略 P1-5 要求配置它**，这是升级而非修 bug。
- `WEB_REVALIDATION_SECRET` 是可选变量，不要在 `verify-runtime-config.mjs` 加硬断言。
- 前台数据表用 `hidden xl:block` + `table-fixed` + 显式百分比列宽，是正确范式。
- 文章表格宽度契约：`.article-table-scroll table` 必须 `table-fixed` + `min-width: min(calc(var(--article-table-columns,4) * 5rem), 720px)`，有跨文件守卫，不要改。

---

## 验证命令

```bash
bun run verify:public-seo
bun run verify:trust-pages
bun run verify:cache
bun run lint
bun run typecheck
SKIP_ENV_VALIDATION=1 bun run build
SITE_URL=http://127.0.0.1:3000 bun run smoke:public-seo --all
bun scripts/audit-public-seo-data.ts
```

> 注意：本地 Bun 为 1.3.14，低于项目固定的 1.4.2。`verify:bun` / `verify:deploy` / `verify:runtime-config` / `verify:security-runtime` 中依赖运行版本或 release 产物的用例在本地会失败，属环境问题。不要用本地 Bun 跑 `bun run build`。
