# 服务器知识库中英双语实施规格

- 状态：历史实施规格；仓库基线已实现，生产状态以发布审计为准
- 基线：`fc0a1eeeb8d6`
- 日期：2026-07-26
- 范围：公开知识库、CMS、数据库、SEO、缓存、AI 知识检索与首批内容生产
- 延伸方案：[服务器知识库与经验选型完整实施方案](./server-knowledge-decision-platform-implementation-plan.md)

## 1. 结论

一期交付定义为 30 个双语知识单元，而不是 30 篇混合中英文的文章。每个知识单元由一篇中文源稿和一篇英文译稿组成，共 60 个可独立编辑、审核、发布、检索和收录的页面。

最终采用以下不可变更的设计边界：

1. 中英文正文保存为两条独立的 `knowledge_articles` 记录。
2. 英文记录必须指向一篇中文源稿；不允许孤立英文记录、自指或多级翻译链。
3. 分类共享一条记录，通过英文名称、slug 和描述完成本地化。
4. 中英文正文、SEO 字段、检索字段和 AI 引用开关分别存储；英文发布与 AI 授权受中文源稿状态和同步版本约束。
5. 全局 slug 唯一约束保持不变；每个双语单元必须登记两个不同且稳定的 slug。
6. 译文同步状态使用内容版本号判断，不使用中英文 `updatedAt` 直接比较。
7. 所有公开查询、相关推荐、sitemap 和 AI 检索必须在数据库查询层强制限定语言。
8. 英文翻译以已审核中文正文为唯一事实链，不二次检索英文知识库补充事实。
9. 价格、库存、商家承诺和短期线路实测不进入长青知识正文，也不得作为长期 AI 知识引用。
10. 公开内容更新时间使用独立的 `contentUpdatedAt`；除首次公开外，后台保存、发布状态和 AI 开关不得污染页面更新时间或 SEO 时间。

## 2. 当前状态

仓库已经具备中文知识库的完整基础：

- 数据表：`knowledge_categories`、`knowledge_articles`
- 公开入口：`/knowledge`、`/knowledge/[slug]`
- CMS：分类管理、草稿、发布、Markdown 正文和 AI 引用开关
- SEO：`TechArticle`、canonical、面包屑与 `sitemap-knowledge.xml`
- AI：已发布且允许引用的知识条目可进入中文文章改写上下文

当前缺口如下：

- 知识文章没有 `language` 和翻译关系字段。
- 分类没有英文名称、英文 slug 和英文描述。
- 公开数据读取、搜索、相关推荐和 sitemap 没有语言条件。
- 英文站 Header、Footer 没有知识库入口。
- 缓存刷新只覆盖中文知识库路径。
- AI 检索接口没有语言参数。
- 根布局固定输出 `<html lang="zh-CN">`，英文路由的文档语言不正确。

## 3. 目标

### 3.1 平台目标

1. 支持 `/knowledge` 和 `/en/knowledge` 两套完整公开路径。
2. 支持中文源稿与英文译稿的一对一关系和同步状态。
3. 支持 CMS 按语言筛选、创建译稿、查看配对、识别过期译文和独立发布。
4. 确保中英文搜索、相关推荐、SEO、缓存和 AI 检索完全隔离。
5. 现有中文 URL、中文内容和中文 AI 引用在没有英文译稿时保持原行为。

### 3.2 内容目标

1. 发布 30 篇中文源稿和 30 篇英文译稿。
2. P0 的 12 个双语单元先形成“选购、测试、部署、排障”闭环。
3. P1 的 18 个双语单元补全六个知识分类。
4. 每个发布页面具备来源、核验日期、同语言内链和本语言检索元数据。

## 4. 非目标

- 不把知识文章改造成普通 `posts` 文章。
- 不在同一条知识记录中增加 `enTitle`、`enContent` 等并列英文字段。
- 不支持除中文和英文之外的第三种语言。
- 不新增多级知识分类或知识标签系统。
- 不为分类筛选页新增独立 SEO 落地路由。
- 不把价格、库存、优惠码和商家时效承诺写死到知识库。
- 不在本期实现知识库英文自动翻译后台任务；人工或外部生成的英文内容仍必须通过 CMS 审核后保存。
- 不自动发布 AI 生成内容。
- 本规格文档本身不授权生产迁移、部署、提交或推送；后续实施任务必须按第 14、17 节分阶段并获得对应操作授权。

## 5. 数据模型

### 5.1 知识分类

`knowledge_categories` 保持一类一行，新增：

```ts
enName: text("enName"),
enSlug: varchar("enSlug", { length: 160 }),
enDescription: varchar("enDescription", { length: 800 }),
```

约束：

- `enSlug` 使用唯一约束，允许多行 `NULL`。
- 英文知识文章发布前，其分类必须具有非空的 `enName`、`enSlug` 和 `enDescription`。
- V1 不增加分类关键词字段，因为当前知识分类只是索引页筛选条件，没有独立分类 SEO 页面。

首批分类本地化固定如下：

| 中文分类   | 中文 slug              | 英文名称               | 英文 slug              | 英文描述                                                                                           |
| ---------- | ---------------------- | ---------------------- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| 服务器配置 | `server-configuration` | Server Configuration   | `server-configuration` | Guides to CPU, memory, storage, virtualization, bandwidth, and practical server sizing.            |
| 网络线路   | `network-routes`       | Network Routing        | `network-routes`       | Explanations and tests for carrier routes, BGP, MTR, traceroute, and cross-border connectivity.    |
| 机房与地区 | `datacenter-regions`   | Data Centers & Regions | `datacenter-regions`   | Region selection guidance based on latency, packet loss, user location, and deployment goals.      |
| IP 与网络  | `ip-network`           | IP & Networking        | `ip-network`           | Practical guidance on IPv4, IPv6, ASN, DNS, IP types, ports, and connectivity troubleshooting.     |
| 系统与运维 | `system-operations`    | Systems & Operations   | `system-operations`    | Step-by-step guides for Linux setup, SSH, Docker Compose, Nginx, backups, and maintenance.         |
| 安全与应用 | `security-use-cases`   | Security & Use Cases   | `security-use-cases`   | Security, availability, monitoring, incident troubleshooting, and workload-based server selection. |

### 5.2 知识文章

`knowledge_articles` 新增：

```ts
language: varchar("language", { length: 8 }).default("zh").notNull(),
translationSourceArticleId: integer("translationSourceArticleId"),
contentRevision: integer("contentRevision").default(1).notNull(),
translatedFromRevision: integer("translatedFromRevision"),
contentUpdatedAt: timestamp("contentUpdatedAt").defaultNow().notNull(),
```

含义：

- 中文源稿：`language = "zh"`、`translationSourceArticleId = NULL`、`translatedFromRevision = NULL`。
- 英文译稿：`language = "en"`、`translationSourceArticleId = 中文 ID`；创建草稿和普通内容保存后 `translatedFromRevision = NULL`，仅在人工确认同步后写入中文 `contentRevision`。
- `contentRevision` 从 1 开始，只在影响翻译的字段发生变化时递增。
- 译文同步条件为 `translatedFromRevision = source.contentRevision`；`NULL` 或版本不相等都视为“待同步”。
- 中英文记录各自维护 `contentRevision`；英文版本号用于自身审核留痕，只有中文版本号参与译文同步判断。
- `contentUpdatedAt` 只在公开正文或 SEO 内容实际变化时更新，驱动列表排序、页面可见更新时间、`TechArticle.dateModified` 和 sitemap `lastmod`。
- `publishedAt` 表示首次公开时间：首次发布时写入，取消发布和重新发布都不得清空或重置。

以下字段变化必须递增中文 `contentRevision`：

- `title`
- `summary`
- `content`
- `keywords`
- `aliases`
- `retrievalTerms`
- `sourceNotes`

只修改 slug、发布状态、AI 引用开关或排序展示信息，不递增内容版本。

`contentUpdatedAt` 的更新集合与内容版本集合明确分开：

- `title`、`summary`、`content`、`keywords` 或 `categoryId` 实际变化时更新。
- `aliases`、`retrievalTerms`、`sourceNotes` 等内部检索或审核元数据变化时不更新，除非后续产品明确把该字段渲染到公开页面。
- 创建记录时使用创建时间；首次发布时将 `contentUpdatedAt` 至少推进到 `publishedAt`，保证 `dateModified >= datePublished` 且新发布内容进入正确排序位置。
- 取消发布、重新发布、同步确认、AI 引用授权和普通后台维护不得单独更新 `contentUpdatedAt`。
- 已发布 slug 本期锁定；草稿 slug 调整不改变公开内容时间。

### 5.3 数据库约束与业务不变量

以下行内规则和引用完整性必须由 PostgreSQL 直接保证：

1. `language IN ('zh', 'en')`。
2. 中文记录的翻译源和译自版本必须为空。
3. 英文记录的翻译源必须非空；`translatedFromRevision` 允许为空，表示尚未完成同步审核。
4. `contentRevision >= 1`，`translatedFromRevision IS NULL OR translatedFromRevision >= 1`。
5. `translationSourceArticleId <> id`，禁止自指。
6. 自关联外键使用 `ON DELETE RESTRICT`，删除中文源稿前必须先处理英文译稿。
7. 部分唯一索引 `(translationSourceArticleId, language) WHERE translationSourceArticleId IS NOT NULL`，保证一篇中文源稿最多一篇英文稿。
8. 数据库检查约束保证 `allowAiReference = true` 时 `published = true`。

以下跨行业务不变量无法由普通 `CHECK`、外键或唯一索引完整表达，V1 明确由唯一写入口的事务化 Server Action 保证，不引入 PostgreSQL trigger：

1. 英文翻译源必须是中文源稿，禁止英文指向英文形成翻译链。
2. 英文 `categoryId` 始终等于中文源稿分类，不能由客户端传入并覆盖。
3. 同步确认、英文发布和英文 AI 授权时，`translatedFromRevision` 必须等于锁定后的中文 `contentRevision`。
4. 所有 CMS 写入和后续脚本必须复用同一领域服务；禁止绕过服务直接修改配对、版本、发布或 AI 字段。

若未来开放多个独立写入端，再单独引入 PostgreSQL 延迟约束触发器；不能用简单 `BEFORE` trigger 校验跨行分类，因为同一事务同步更新源稿和译稿时会经过合法的中间状态。

新增或替换索引：

```text
(language, published, categoryId, contentUpdatedAt)
(language, published, allowAiReference, contentUpdatedAt)
(translationSourceArticleId)
(translationSourceArticleId, language) WHERE translationSourceArticleId IS NOT NULL UNIQUE
```

### 5.4 slug 决策

保留当前 `knowledge_articles.slug` 全局唯一约束，与普通文章保持一致。中文和英文路由虽然具有不同路径前缀，仍不得使用相同 slug。

规则：

- 每个内容单元在写作前登记 `zhSlug` 和 `enSlug`。
- 两个 slug 都使用小写 ASCII kebab-case。
- slug 不包含日期、价格、商家名或短期活动名。
- 首次发布后默认锁定 slug；本期不建设重定向系统。
- 必须修改已发布 slug 时，先单独设计并实现永久重定向，不能直接改值。

## 6. 保存、发布与删除语义

### 6.1 新建中文源稿

- 默认 `published = false`。
- 数据库、Server Action 和 CMS 初始表单统一默认 `allowAiReference = false`。
- 保存时由服务端设置 `language = "zh"`，不接受客户端指定翻译源。
- 首次创建使用 `contentRevision = 1`、`translatedFromRevision = NULL`，并由数据库写入 `contentUpdatedAt`。

### 6.2 新建或更新英文译稿

- 必须从中文条目的“创建英文稿”入口进入。
- 服务端读取中文源稿并继承 `categoryId`。
- 首次保存英文稿时设置 `contentRevision = 1`、`translatedFromRevision = NULL`；创建动作不能代替翻译审核。
- 英文稿默认 `published = false`、`allowAiReference = false`。
- 英文表单显示中文源稿、源稿版本和当前同步状态，翻译关系不可改绑。
- 不向数据库写入中文占位正文；英文必填字段完整后才创建记录。
- 已发布英文稿禁止直接修改任何会递增 `contentRevision` 的字段；服务端返回可读错误，运营人员必须先取消发布，再进入“保存草稿 -> 确认同步 -> 重新发布 -> 单独授权 AI”流程。
- 英文翻译相关字段实际变化时，普通保存原子递增英文 `contentRevision`，清空 `translatedFromRevision` 并关闭英文自身 `allowAiReference`；若公开正文或 SEO 内容变化，同时更新英文 `contentUpdatedAt`。
- 只修改发布状态、AI 开关或其他非内容字段时，不递增版本、不清空同步版本，也不更新 `contentUpdatedAt`。
- CMS 提供显式“确认已同步到中文版本”动作；该动作在事务中重新读取中文当前版本，通过校验后才把 `translatedFromRevision` 更新为 `source.contentRevision`。
- 同步确认只记录审核结论和审计日志，不递增英文版本，也不更新 `contentUpdatedAt`。

### 6.3 中文更新

影响翻译的字段变化时，必须在同一事务中：

1. 更新中文内容并在 SQL 中原子执行 `contentRevision = contentRevision + 1`。
2. 公开正文或 SEO 内容变化时更新中文 `contentUpdatedAt`；纯内部检索或审核元数据变化不更新。
3. 关闭中文自身 `allowAiReference`，并关闭关联英文稿的 `allowAiReference`。
4. 保留英文公开状态，但因版本不再相等在 CMS 标记“待同步”。
5. 若本次修改修正严重事实错误，运营人员必须同时下线英文稿，不能等待常规翻译排期。

中文分类变化时，在同一事务中同步英文稿的 `categoryId`，并更新中英文记录各自的 `contentUpdatedAt`。

### 6.4 发布规则

- 中文和英文分别发布，不做隐式双语批量发布。
- 中英文发布前都必须具有非空的 `summary`、`keywords`、`retrievalTerms` 和 `sourceNotes`；`aliases` 仅在确有真实别名时填写，不作为硬门槛。
- 英文发布前必须满足：中文源稿已发布、分类英文信息完整、译文版本同步、英文必填字段完整。
- 英文开启 AI 引用前必须满足：英文已发布、中文源稿已发布，并且管理员已对当前中文版本执行显式同步确认动作。
- 任一语言开启 AI 引用前都必须已经发布；该条件同时由 Server Action 和数据库检查约束保证。
- 任一语言取消发布时，必须在同一事务更新中同时设置本记录 `published = false`、`allowAiReference = false`。
- 取消中文发布还必须同步取消英文发布并关闭英文 AI 引用；取消英文发布不影响中文。
- 未发布的任一语言记录不得进入公开查询、sitemap 或 AI 检索。
- 首次发布设置一次 `publishedAt`，并将 `contentUpdatedAt` 推进到不早于该时间；取消发布不得清空 `publishedAt`，重新发布不得重置两个时间。
- 除首次发布外，发布状态和 AI 开关变化只更新后台 `updatedAt`，不得修改 `contentUpdatedAt`。

### 6.5 删除规则

- 删除英文译稿不影响中文源稿。
- 中文源稿存在英文译稿时禁止删除，CMS 返回“请先删除英文译稿”的可读错误。
- 不使用级联删除，不生成孤立英文记录。

### 6.6 审核留痕

V1 不新增独立审核状态表或审核状态字段。人工审核通过由以下两处共同留痕：

- `sourceNotes` 保存审核人、核验日期、来源主张和下次复核日期。
- 现有 Admin Action 审计日志保存发布、同步确认和 AI 引用授权的操作者与时间。

机器可执行的同步门槛只依赖持久化的 `translatedFromRevision`，不依赖可能异步写入或按保留策略清理的审计日志。执行“确认同步”即管理员对当前版本作出审核确认；`sourceNotes` 保存详细证据，审计日志仅作辅助追溯。

发布、确认同步和授权 AI 引用必须是三个独立的管理动作，不能由一次普通保存隐式完成。

### 6.7 专用动作与并发控制

通用保存动作只负责草稿内容。同步确认、发布、取消发布、AI 授权、中文修订和删除必须拆成专用事务命令，并遵循：

1. 涉及配对记录时始终先锁中文源稿，再锁英文稿，使用 `SELECT ... FOR UPDATE` 或等价条件更新，禁止反向锁序。
2. 同步确认、英文发布和英文 AI 授权都在持锁后重新读取源稿发布状态与版本，不信任客户端提交的旧状态。
3. 编辑表单提交 `expectedContentRevision`；版本不一致时拒绝覆盖并提示刷新，防止两名编辑静默互相覆盖。
4. 内容版本使用数据库原子递增；发布和 AI 授权使用带当前版本条件的更新，受影响行数为 0 时按并发冲突处理。
5. 事务提交成功后再发送缓存失效事件；审计日志失败不得伪装成业务失败，也不得承担数据完整性约束。

## 7. 公开数据层

公开数据 API 必须把语言作为显式业务边界：

```ts
type PublicKnowledgeLanguage = "zh" | "en";
```

要求：

- 列表、全文搜索、详情和相关推荐的 SQL 都包含 `knowledgeArticles.language = language`。
- 中文路由访问英文 slug 返回 `notFound()`，英文路由访问中文 slug 同样返回 `notFound()`。
- 分类数量按语言分别统计，只统计该语言已发布文章。
- 中文分类筛选使用 `knowledgeCategories.slug`。
- 英文分类筛选使用 `knowledgeCategories.enSlug`。
- 英文页面不回退显示中文分类名称或中文正文；缺少英文分类信息时不允许发布英文文章。
- 同分类推荐只返回当前语言条目。
- 公开列表排序和显示更新时间统一使用 `contentUpdatedAt`，不得回退到后台操作用的 `updatedAt`。

缓存边界：

- 不给现有稳定分类缓存函数增加请求语言参数。
- 稳定分类读取一次返回中英文字段以及中英文发布数量，路由边界再做本地化。
- 查询、分页、搜索和详情等动态读取在 SQL 中显式过滤语言，不把请求参数拉入新的不稳定 `use cache` 边界。

## 8. 公开路由与界面

保留：

```text
/knowledge
/knowledge/[slug]
```

新增：

```text
/en/knowledge
/en/knowledge/[slug]
```

实现要求：

- 复用同一套知识索引和详情组件，通过明确的 `language` 配置本地化，不复制两套大页面。
- 最终代理位置为 `apps/web/app/(zh)/knowledge/...` 和 `apps/web/app/(en)/en/knowledge/...`；route group 不改变 `/knowledge` 与 `/en/knowledge` 的公开 URL。
- 英文页显式使用 `<Header language="en" />` 和 `<Footer language="en" />`。
- Header 英文导航增加 `Knowledge Base`，Footer 英文常用入口增加 `Server Knowledge Base`。
- 页面标题、搜索占位符、分类、分页、日期、按钮、空状态、404 和相关知识全部本地化。
- 英文页内部知识链接统一使用 `/en/knowledge/...`。
- 移动端入口保持至少 44px 的可点击高度，导航后关闭 Sheet。

语言切换规则：

- 详情页只在已发布配对存在时提供精确对应链接。
- 缺少已发布配对时，语言切换回退到另一语言的知识库首页，不猜测 slug。
- 索引页切换语言时可映射已选择分类；搜索词和页码默认清空，避免把中文查询带到英文搜索。
- `LanguageSwitchLink` 必须识别 `/knowledge` 与 `/en/knowledge` 的回退路径。

## 9. SEO、结构化数据与 sitemap

### 9.1 索引页

- 中文 canonical：`/knowledge`
- 英文 canonical：`/en/knowledge`
- 两个索引页互相输出 `zh-CN`、`en` 和 `x-default`，其中 `x-default` 指向中文首页。
- 标题和描述分别按本语言生成，不共用中文 metadata。
- 带 `q`、`category` 或 `page` 参数的搜索、筛选和分页状态统一输出 `robots: noindex,follow`，canonical 指向本语言无参数的知识库首页。
- 参数页不输出包含查询参数的语言 alternate；V1 直接省略参数页的 `alternates.languages`，避免制造搜索与分页组合 URL。
- 只有无参数的两种语言知识库首页进入 sitemap；参数组合不生成可索引 URL。

索引页首版 metadata 固定为：

| 语言 | title                                                      | description                                                                                                                                                       |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 中文 | 服务器知识库：配置、线路、机房与 IP 基础知识               | 查询 VPS、云服务器、独立服务器配置，CN2 GIA、CMI、BGP 等线路，以及机房、IP、网络和运维基础知识。                                                                  |
| 英文 | Server Knowledge Base: VPS, Networks, Data Centers, and IP | Learn how to choose and operate VPS, cloud, and dedicated servers, understand network routes and regions, and troubleshoot common IP, DNS, and deployment issues. |

### 9.2 详情页

- canonical 始终指向当前语言 URL。
- 只有中英文双方均已发布且翻译关系有效时才输出双向 `hreflang`。
- `TechArticle` 增加 `inLanguage: "zh-CN" | "en"`。
- Breadcrumb、Open Graph、Twitter 和页面可见文案使用当前语言。
- `x-default` 指向中文源稿。
- 缺少配对时不得输出不存在的 alternate URL。
- 页面可见更新时间和 `TechArticle.dateModified` 使用 `contentUpdatedAt`；发布时间继续使用 `publishedAt`，不得用后台 `updatedAt` 代替内容时间。

“有效配对”只要求源关系正确且中英文双方均已发布，不要求当前版本同步。中文更新后，仍公开但待同步的英文继续保留双向 `hreflang`；版本状态只阻止英文首次/重新发布和 AI 授权。若事实偏差严重，必须按 6.3 的规则主动下线英文，而不是用 SEO metadata 隐式处理。

### 9.3 sitemap

继续使用一份 `sitemap-knowledge.xml`，不要把知识页重复加入 `sitemap-en.xml`。

该 sitemap 包含：

- `/knowledge`
- `/en/knowledge`
- 所有已发布中文知识详情
- 所有已发布英文知识详情
- 已发布配对的双向 alternate

详情 URL 的 `lastmod` 使用对应记录的 `contentUpdatedAt`。除首次公开外，重新发布、AI 授权和同步确认不得仅因后台状态变化推动 sitemap 时间。

### 9.4 文档语言

双语知识库发布前，英文路由必须实际渲染 `<html lang="en">`，中文路由保持 `<html lang="zh-CN">`。

固定采用静态 route group 的双 root layout 方案，不在实施阶段重新选型：

1. Web 应用不再使用单一 `apps/web/app/layout.tsx`；将默认语言页面代理移入 `apps/web/app/(zh)/`，将现有 `/en/**` 页面代理移入 `apps/web/app/(en)/en/`。route group 不进入 URL，因此公开路径保持不变。
2. `apps/web/app/(zh)/layout.tsx` 输出 `<html lang="zh-CN">`，`apps/web/app/(en)/layout.tsx` 输出 `<html lang="en">`，并分别提供本语言根 metadata。
3. 字体、`body` class 和通用 Provider 下沉为不包含 `<html>` 的共享壳组件，供两个 Web root layout 和 CMS 中文 root layout 复用。
4. Route Handler 和 sitemap 文件无需为语言布局搬迁；所有会渲染页面的 Web 代理路由必须归入且只能归入一个语言 route group。
5. 中英文 route group 之间切换会发生完整页面导航，这是正确文档语言的可接受代价；同语言内部导航仍保持客户端导航。
6. 将现有中文 404 移入 `(zh)`，在两个 route group 内分别提供本地化 `not-found.tsx`；增加 `(zh)/[...notFound]/page.tsx` 与 `(en)/en/[...notFound]/page.tsx` 并调用 `notFound()`，保证未知英文 URL 也经过英文 root layout。

不得使用客户端脚本修改 `document.documentElement.lang`，也不得在 root layout 中通过 `headers()`、pathname 或 middleware 注入语言，这些做法会造成首屏 HTML 错误或破坏静态缓存边界。

这是双语知识库的发布门槛，同时需要回归 `/`、`/en`、中英文普通文章、中英文知识页、两种语言 404 和 CMS 根布局。

## 10. 缓存与重新验证

`knowledge.changed` 必须覆盖：

```text
/knowledge
/en/knowledge
/knowledge/[zhSlug]
/en/knowledge/[enSlug]
/sitemap.xml
/sitemap-knowledge.xml
```

要求：

- 保存任一语言记录时刷新该记录、配对记录、两种语言索引和 sitemap。
- slug 全局唯一，因此现有 `knowledgeSlug(slug)` tag 可以保留。
- `knowledgeArticle(id)` 继续按记录 ID 缓存，不跨语言复用结果。
- 中文内容版本变化时刷新英文详情，即使英文正文未立即更新，因为语言切换和同步状态可能变化。
- 缓存目标生成逻辑增加测试，防止英文路径遗漏。

## 11. AI 知识检索

### 11.1 API

检索接口改为语言必填：

```ts
retrieveRewriteKnowledge({
  language: "zh" | "en",
  values,
  limit,
});
```

SQL 必须同时满足：

```text
language = input.language
published = true
allowAiReference = true
```

不得进行隐式跨语言回退。

### 11.2 当前生成链路

当前只有中文文章事实改写调用知识检索，因此：

- `rewriteArticleWithAi()` 固定传入 `language = "zh"`。
- 英文文章生成继续从已改写中文 Markdown 翻译，不再次查询英文知识库。
- 英文翻译不得借助知识检索增加中文事实包中不存在的商家、线路、ASN、性能或地区结论。
- 未来新增“英文原生改写/英文独立生成”入口时，才允许传入 `language = "en"`，且仍不得回退中文。

### 11.3 AI 引用授权

- 新建知识条目默认不允许 AI 引用。
- 中文条目完成事实审核并发布后可单独开启。
- 英文条目必须已发布，并由管理员对当前中文版本执行同步确认后才能开启。
- 任一记录的 `contentRevision` 递增时，事务内自动关闭该记录自身 AI 引用；中文内容版本递增还要关闭关联英文 AI 引用。
- 任一记录取消发布时同步关闭自身 AI 引用；中文取消发布同时处理关联英文。
- 价格、库存、商家承诺、节点可用性和短期线路测试一律关闭 AI 引用。

## 12. 内容生产规范

### 12.1 双语生产流程

```text
中文选题卡
-> 中文研究与来源登记
-> 中文草稿
-> 中文技术审核
-> 英文草稿
-> 英文技术与语言审核
-> 双语 SEO 与内链审核
-> 确认英文已同步到当前中文版本
-> 中文发布
-> 英文发布
-> 分别授权 AI 引用
```

英文稿是独立技术编辑稿，不是逐句机器直译稿。它必须保持中文源稿的事实边界，但可以根据英文用户的阅读习惯重组标题、段落和搜索表达。

### 12.2 固定正文结构

中文和英文都使用以下信息结构：

```text
适合谁 / Who this is for
不适合谁 / When not to use it
结论 / Key takeaway
核心概念或判断表 / Key concepts or decision table
操作步骤 / Steps
验证方法 / Verification
常见错误与风险 / Pitfalls and limits
核验日期与来源 / Verification date and sources
相关知识 / Related knowledge
```

### 12.3 CMS 字段规范

- `title`：一个规范概念加一个明确用户问题。
- `summary`：中文 80-160 字；英文 140-260 个字符，脱离正文仍可独立理解。
- `keywords`：每种语言 5-8 个规范搜索词。
- `aliases`：只放缩写、英文全称、拼写变体和真实别名。
- `retrievalTerms`：每种语言 6-12 个真实问法或场景词，不混写另一种自然语言。
- `sourceNotes`：使用“事实等级｜核验日期｜URL｜支持主张｜审核人｜下次复核日｜风险”的格式。
- `content`：Markdown，命令必须带语言标识代码块，操作教程必须包含验证和失败处理。
- 每篇至少包含 2 条同语言知识内链。

### 12.4 翻译规则

- 命令、代码块、IP、端口、协议、URL、ASN、产品型号和单位保持不变。
- `CN2 GIA`、`CMI`、`CMIN2`、`CUII`、`BGP`、`KVM`、`IPv4`、`IPv6` 等标准标识保持原文。
- “去程”根据上下文使用 `outbound path`，“回程”使用 `return path`。
- “中国大陆访问”使用 `access from mainland China`，不得泛化成全球体验。
- “高防”使用 `DDoS-protected hosting` 或具体防护能力，不使用直译 `high defense`。
- “广播 IP”属于主机市场语境，英文正文必须解释具体含义，不得与协议中的 broadcast address 混为一谈。
- 不把中文内容中的地区经验写成没有测试范围的全球结论。
- 英文标题、摘要、关键词和检索词独立编写，不能直接复制中文关键词。

### 12.5 来源与复核周期

| 等级 | 来源                                       | 用法                               |
| ---- | ------------------------------------------ | ---------------------------------- |
| A    | 标准组织、官方协议文档、厂商一手文档       | 可支撑核心定义和操作要求           |
| B    | 可复现测试，记录地点、时间、工具和原始结果 | 可支撑限定范围内的实测结论         |
| C    | 可信技术媒体或二手资料                     | 只作补充，不单独支撑关键结论       |
| D    | 论坛、社媒、匿名评论                       | 只用于发现线索，不进入最终事实结论 |

复核周期：

- 稳定基础概念：12 个月。
- 线路、地区和运营商术语：6 个月。
- Linux、Docker、Nginx 等版本相关教程：3-6 个月。
- 安全事件或严重事实纠错：24-72 小时内更新或下线。
- 价格、库存和促销不作为知识库长青内容维护。

## 13. 首批 30 个双语内容单元

分类使用稳定 `categorySlug` 查询实际 `categoryId`，不得假定生产数据库自增 ID。

| ID     | 优先级 | 分类       | 中文标题                                                | 中文 slug                                                     | 英文标题                                                  | 英文 slug                                           |
| ------ | ------ | ---------- | ------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------- |
| KB-001 | P0     | 服务器配置 | VPS、云服务器和独立服务器有什么区别？新手怎么选         | `vps-cloud-server-dedicated-server-differences`               | VPS vs Cloud Servers vs Dedicated Servers: How to Choose  | `vps-vs-cloud-vs-dedicated-servers`                 |
| KB-002 | P0     | 服务器配置 | CPU、内存、硬盘怎么配：按网站、应用和数据库选 VPS       | `vps-cpu-memory-storage-sizing`                               | How to Size CPU, RAM, and Storage for a VPS               | `how-to-size-cpu-ram-storage-for-vps`               |
| KB-003 | P1     | 服务器配置 | 带宽、流量和端口速度是什么意思？怎么判断够不够用        | `bandwidth-traffic-port-speed-explained`                      | Server Bandwidth, Data Transfer, and Port Speed Explained | `server-bandwidth-data-transfer-port-speed-guide`   |
| KB-004 | P1     | 服务器配置 | KVM、LXC 和 OpenVZ 虚拟化有什么区别                     | `kvm-lxc-openvz-virtualization-comparison`                    | KVM vs LXC vs OpenVZ: Virtualization Compared             | `kvm-vs-lxc-vs-openvz`                              |
| KB-005 | P1     | 服务器配置 | NVMe、SSD、HDD 怎么选：容量、IOPS 与数据库性能          | `nvme-ssd-hdd-server-storage-guide`                           | NVMe vs SSD vs HDD for Servers                            | `nvme-vs-ssd-vs-hdd-for-servers`                    |
| KB-006 | P0     | 网络线路   | CN2 GIA、CN2 GT 和 163 骨干网有什么区别                 | `cn2-gia-cn2-gt-163-network-routes`                           | CN2 GIA vs CN2 GT vs ChinaNet 163                         | `cn2-gia-vs-cn2-gt-vs-chinanet-163`                 |
| KB-007 | P1     | 网络线路   | CMI、CMIN2、CUII 和移动精品网怎么选                     | `cmi-cmin2-cuii-mobile-premium-network`                       | CMI, CMIN2, and CUII: Route Comparison                    | `cmi-cmin2-cuii-route-comparison`                   |
| KB-008 | P1     | 网络线路   | BGP 线路是什么？多线网络适合哪些业务                    | `bgp-network-route-guide`                                     | What Is BGP Routing and When Does Hosting Need It?        | `what-is-bgp-routing-for-hosting`                   |
| KB-009 | P0     | 网络线路   | 怎么看 VPS 的去程和回程线路？MTR 与 Traceroute 检测指南 | `vps-route-test-mtr-traceroute`                               | How to Test VPS Routes with MTR and Traceroute            | `how-to-test-vps-routes-with-mtr-and-traceroute`    |
| KB-010 | P1     | 网络线路   | IPLC、IEPL、专线和普通国际线路有什么区别                | `iplc-iepl-dedicated-line-comparison`                         | IPLC vs IEPL vs the Public Internet                       | `iplc-vs-iepl-vs-public-internet`                   |
| KB-011 | P0     | 机房与地区 | 国内访问网站，香港、日本、新加坡和美西机房怎么选        | `server-region-guide-china-hong-kong-japan-singapore-us-west` | Choosing a Server Region for Users in Mainland China      | `best-server-region-for-mainland-china-users`       |
| KB-012 | P0     | 机房与地区 | 延迟、丢包和抖动如何影响网站与远程连接体验              | `latency-packet-loss-jitter-explained`                        | How Latency, Packet Loss, and Jitter Affect Hosting       | `how-latency-packet-loss-and-jitter-affect-hosting` |
| KB-013 | P1     | 机房与地区 | 香港 VPS 怎么选：机房、线路、带宽与业务场景             | `hong-kong-vps-datacenter-selection-guide`                    | How to Choose a Hong Kong VPS                             | `how-to-choose-a-hong-kong-vps`                     |
| KB-014 | P1     | 机房与地区 | 日本和新加坡 VPS 怎么选：面向中国大陆与东南亚的部署建议 | `japan-singapore-vps-region-selection`                        | Japan vs Singapore VPS: Which Region Fits Your Users?     | `japan-vs-singapore-vps`                            |
| KB-015 | P1     | 机房与地区 | 美国 VPS 怎么选：西海岸、东海岸与全球用户访问差异       | `us-vps-west-east-region-selection`                           | US West vs US East VPS: Region Selection Guide            | `us-west-vs-us-east-vps`                            |
| KB-016 | P0     | IP 与网络  | IPv4 和 IPv6 有什么区别？服务器是否需要双栈             | `ipv4-ipv6-dual-stack-server-guide`                           | IPv4 vs IPv6: Does Your Server Need Dual Stack?           | `ipv4-vs-ipv6-and-dual-stack-hosting`               |
| KB-017 | P1     | IP 与网络  | 原生 IP、广播 IP 和住宅 IP 有什么区别                   | `native-broadcast-residential-ip-differences`                 | Native, Broadcast, and Residential IP Addresses Compared  | `native-vs-broadcast-vs-residential-ip`             |
| KB-018 | P1     | IP 与网络  | ASN 是什么？如何查询 IP 所属网络和运营商                | `asn-ip-isp-lookup-guide`                                     | How to Look Up an ASN, IP Owner, and ISP                  | `how-to-look-up-asn-ip-owner-and-isp`               |
| KB-019 | P0     | IP 与网络  | DNS 是什么？A、AAAA、CNAME 记录怎么配置                 | `dns-records-a-aaaa-cname-guide`                              | DNS Records Explained: A, AAAA, and CNAME                 | `a-aaaa-and-cname-dns-records-explained`            |
| KB-020 | P1     | IP 与网络  | IP 被封、端口不通、DNS 解析失败：VPS 网络问题排查       | `vps-ip-port-dns-troubleshooting`                             | Troubleshooting VPS IP, Port, and DNS Issues              | `troubleshoot-vps-ip-port-and-dns-issues`           |
| KB-021 | P0     | 系统与运维 | 新购 VPS 的 Linux 初始化清单：账户、更新、时区和 SSH    | `new-vps-linux-initial-setup-checklist`                       | New Linux VPS Setup Checklist                             | `new-linux-vps-setup-checklist`                     |
| KB-022 | P1     | 系统与运维 | SSH 密钥登录怎么配置：禁用密码前的安全切换方法          | `ssh-key-authentication-secure-setup`                         | How to Set Up SSH Key Authentication Safely               | `set-up-ssh-key-authentication-safely`              |
| KB-023 | P0     | 系统与运维 | Docker Compose 部署网站和应用的完整流程                 | `docker-compose-deploy-web-app-guide`                         | Deploying Web Apps with Docker Compose                    | `deploy-web-apps-with-docker-compose`               |
| KB-024 | P1     | 系统与运维 | Nginx 反向代理与 HTTPS 配置指南                         | `nginx-reverse-proxy-https-guide`                             | Nginx Reverse Proxy and HTTPS Setup Guide                 | `nginx-reverse-proxy-and-https-setup`               |
| KB-025 | P1     | 系统与运维 | 服务器备份与恢复怎么做：数据库、文件和异地备份          | `server-backup-restore-strategy`                              | Server Backup and Restore Strategy                        | `server-backup-and-restore-strategy`                |
| KB-026 | P0     | 安全与应用 | Linux 服务器基础加固：防火墙、最小权限和更新策略        | `linux-server-security-hardening-basics`                      | Linux Server Hardening Checklist                          | `linux-server-hardening-checklist`                  |
| KB-027 | P1     | 安全与应用 | DDoS 防护是什么？高防、清洗和业务可用性怎么理解         | `ddos-protection-high-defense-guide`                          | DDoS Protection, Mitigation, and Traffic Scrubbing        | `ddos-protection-mitigation-and-scrubbing`          |
| KB-028 | P0     | 安全与应用 | 502、504、连接被拒绝：网站不可访问排障流程              | `website-502-504-connection-refused-troubleshooting`          | Troubleshooting 502, 504, and Connection Refused Errors   | `troubleshoot-502-504-and-connection-refused`       |
| KB-029 | P1     | 安全与应用 | 服务器监控与告警怎么做：CPU、内存、磁盘、证书和可用性   | `server-monitoring-alerting-guide`                            | Server Monitoring and Alerting Basics                     | `server-monitoring-and-alerting-basics`             |
| KB-030 | P1     | 安全与应用 | 个人网站、企业官网、跨境电商和 API 服务如何选服务器     | `server-selection-by-use-case`                                | How to Choose a Server for Your Workload                  | `choose-a-server-by-workload`                       |

## 14. 实施顺序

代码改动边界固定如下：

| 层             | 主要文件或目录                                                                                       | 交付结果                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 数据库         | `packages/db/schema.ts`、`drizzle/`                                                                  | 双语字段、内容版本与时间字段、约束、索引和安全回填迁移                |
| CMS 动作       | `src/features/cms/actions/knowledge.ts`                                                              | 事务保存、配对、内容时间、版本递增、同步确认、发布、AI 授权和删除语义 |
| CMS 界面       | `src/features/cms/components/knowledge-manager.tsx`、知识管理路由                                    | 语言筛选、配对状态、英文编辑和可读操作反馈                            |
| 公开数据       | `src/features/public/data/knowledge.ts`                                                              | 所有查询强制语言隔离和分类本地化                                      |
| 公开路由       | `src/features/public/routes/knowledge/`、`src/features/public/routes/en/knowledge/`、`apps/web/app/` | 中英文索引、详情和薄路由代理                                          |
| 全站导航与布局 | Header、Footer、`language-switch-link.tsx`、`apps/web/app/(zh)`、`apps/web/app/(en)`、共享文档壳     | 英文入口、精确语言切换和静态正确的 `html lang`                        |
| SEO 与缓存     | `src/features/public/routes/sitemaps.ts`、`packages/cache/tags.ts`                                   | 双语 canonical、alternate、sitemap 与重新验证                         |
| AI             | `packages/ai/knowledge-retrieval.ts`、`packages/ai/article-rewriter.ts`                              | 检索语言必填，现有改写固定中文知识                                    |
| 测试           | `tests/`、仓库验证脚本                                                                               | 数据约束、语言隔离、版本、SEO、缓存和 AI 回归                         |

### 阶段 0：数据库与线上状态审计

1. 核对生产数据库中的知识表、列、索引和约束。
2. 核对 `__drizzle_migrations` 是否已包含知识库基础迁移。
3. 统计现有知识分类、中文条目、发布状态、slug 和 AI 引用状态。
4. 确认内容矩阵中的 60 个 slug 与现有数据无冲突。

### 阶段 1A：兼容性预发布

该阶段不得创建任何英文知识记录，目标是先让旧数据和写入行为兼容后续严格约束。

1. 将数据库默认值、Zod 默认值和 CMS 初始表单统一改为 `allowAiReference = false`。
2. 修改现有取消发布动作：同一更新中关闭本记录 AI并保留首次 `publishedAt`。Release A 尚无翻译关系字段，只处理当前记录；配对英文的联动从 Release B 启用。
3. 生成并审查兼容迁移：修改 AI 默认值，关闭所有未发布记录的 AI；已发布记录保留原授权值并进入人工复核清单。此时不添加 `allowAiReference => published` 检查约束。
4. 部署 Release A，确认所有旧 PM2 进程已经退出，新 CMS 创建草稿和取消发布均符合新规则。
5. 完成 Release A 的 lint、类型、测试、迁移和构建验证后，才进入双语结构迁移。

### 阶段 1B：平台双语能力

1. 对知识库 CMS 开启短暂写入维护窗口；公开读取继续服务。
2. 更新最终 schema，并用 `bun run db:generate` 生成迁移；人工将生成 SQL 整理为 `expand -> backfill -> validate -> constrain`，不使用生产 `db:push`。
3. `expand`：先以可空兼容列加入双语、版本和内容时间字段，添加分类英文列；不得用 `DEFAULT now()` 一步把全部历史内容时间写成迁移时间。
4. `backfill`：现有文章写入 `language = 'zh'`、`contentRevision = 1`、`translatedFromRevision = NULL`；`contentUpdatedAt` 使用 `GREATEST(createdAt, COALESCE(updatedAt, createdAt), COALESCE(publishedAt, createdAt))`。已发布但缺少 `publishedAt` 的记录使用现有可信时间补齐。
5. 回填六个分类的英文名称、slug 和描述，再次关闭所有未发布记录的 AI，并验证语言值、空值、60 个预登记 slug、现有 slug、发布时间和 AI 状态。
6. `constrain`：添加 `NOT NULL`、默认值、语言检查、自关联 FK、部分唯一索引和 `allowAiReference => published` 检查；先增加语言化新索引，旧索引保留到上线稳定后再评估删除。
7. 完成专用事务动作、固定行锁顺序、翻译关系、内容时间、版本同步、发布与删除语义。
8. 完成语言化数据读取、英文公开路由、Header、Footer、语言切换、SEO、sitemap 和缓存刷新。
9. 给知识检索增加必填语言，把现有改写调用固定为中文，并完成静态双 root layout 改造。
10. 部署 Release B，验证数据库迁移和新应用均成功后关闭维护窗口；在没有写入英文文章前完成全套自动验证和回滚演练。

### 阶段 2：4 个双语试点

试点选择：

- KB-001：产品形态选型
- KB-006：线路概念
- KB-012：网络质量指标
- KB-021：Linux 初始化

试点必须覆盖分类筛选、全文搜索、译文过期、语言切换、`hreflang`、sitemap、缓存和 AI 检索隔离。

### 阶段 3：完成 P0

完成剩余 8 个 P0 双语单元，达到 12 篇中文加 12 篇英文，共 24 个核心页面。

### 阶段 4：完成 P1

完成 18 个 P1 双语单元，达到 30 个双语单元、60 个详情页面。

### 阶段 5：全量复核

1. 检查来源、核验日期和复核周期。
2. 检查 60 个 canonical 和已配对页面的双向 `hreflang`。
3. 检查中英文搜索、相关推荐和内链不串语言。
4. 检查所有 AI 引用开关与内容时效一致。
5. 抽查 10 组双语文章的事实、命令、风险边界和链接。

## 15. 测试计划

### 15.1 数据约束

- 中文不能设置翻译源或译自版本。
- 英文必须具有中文源；新建草稿允许译自版本为空。
- 英文不能指向自身或另一篇英文。
- 同一中文源不能创建第二篇英文。
- 英文分类始终继承中文。
- 中文存在英文时不能删除。
- 未发布记录不能开启 AI 引用，直接绕过应用写库也会被数据库约束拒绝。
- 使用脱敏的生产结构与历史数据样本执行 Release A -> Release B 迁移 smoke；样本必须包含草稿、已发布记录和已发布但缺少 `publishedAt` 的异常记录，并核对行数、slug、发布状态、AI 授权、`publishedAt` 与 `contentUpdatedAt` 回填结果。

### 15.2 版本与发布

- 中文翻译相关字段变化会递增版本，并关闭中文自身及配对英文的 AI 引用。
- 只修改中文 slug、发布或 AI 开关不递增版本。
- 新建英文草稿的 `translatedFromRevision` 为空。
- 已发布英文稿的内容保存被拒绝，取消发布后才能修改。
- 英文草稿内容保存会递增英文版本、清空 `translatedFromRevision`、关闭自身 AI，不会自动标记同步。
- 显式同步确认会把译自版本更新到中文当前版本并留下审计记录。
- 旧版本英文不能发布或开启 AI 引用。
- 取消任一语言发布会在同一更新中关闭自身 AI；中文取消发布还会同步取消英文发布和 AI。
- 英文取消发布不影响中文。
- 首次发布设置且只设置一次 `publishedAt`，并将 `contentUpdatedAt` 推进到不早于首次发布时间。
- 重新发布、内部检索或审核元数据、AI 开关和同步确认不会更新 `contentUpdatedAt`，取消发布不会清空 `publishedAt`。
- 两个编辑使用相同预期版本保存时，后提交者收到并发冲突而不是覆盖前者。

### 15.3 公开数据

- 中文列表、搜索、详情、分类数量和推荐不返回英文。
- 英文列表、搜索、详情、分类数量和推荐不返回中文。
- 中文路由访问英文 slug 返回 404，反向同样返回 404。
- 缺少英文分类本地化时，英文发布被服务端拒绝。

### 15.4 SEO 与缓存

- 中英文索引 canonical 正确。
- 只有双方已发布时输出双向 alternate。
- `TechArticle.inLanguage` 正确。
- 页面更新时间、列表排序、`TechArticle.dateModified` 和 sitemap `lastmod` 使用 `contentUpdatedAt`。
- `page=1`、无效页码、单一和组合 `q/category/page` 参数均为 `noindex,follow`，canonical 指向本语言干净索引页且不输出查询参数 alternate。
- 已发布但待同步的有效配对继续输出 `hreflang`；任一方下线后移除。
- sitemap 包含正确语言 URL，不包含草稿。
- 知识变更刷新中英文索引、对应详情和 sitemap。
- `/`、`/en`、中英文文章、知识页、未知中英文 URL 和 CMS 分别输出正确的根布局与文档语言。

### 15.5 AI 检索

- 语言参数为必填。
- 中文改写只命中中文已发布、已授权知识。
- 未发布或未授权记录不能命中。
- 英文翻译链不二次查询知识库。
- 未来英文原生检索不存在中文隐式回退。

### 15.6 验证命令

按顺序执行：

```bash
bun run lint
bun run typecheck
bun run test
bun run verify:migrations
bun run verify:cache
SKIP_ENV_VALIDATION=1 bun run build
```

数据库或缓存相关测试需要并行执行时，由测试框架控制；上述仓库级命令仍保持顺序，避免 `.next` 类型产物互相影响。

## 16. 验收标准

### 16.1 平台验收

- [ ] schema、迁移和 Drizzle 元数据一致。
- [ ] 现有知识数据安全回填为中文，`contentUpdatedAt` 已由历史时间生成，URL 和发布状态不变。
- [ ] 所有历史草稿已关闭 AI 引用；历史已发布条目的授权值未被迁移盲目覆盖并已完成人工复核。
- [ ] Release A 兼容行为稳定后才添加严格约束，Release B 迁移按 expand/backfill/validate/constrain 顺序执行。
- [ ] 中英文文章一对一关系、版本和删除约束生效。
- [ ] 新文章默认草稿且默认不允许 AI 引用。
- [ ] `/knowledge` 和 `/en/knowledge` 列表、搜索、分页、详情和推荐完整可用。
- [ ] 英文 Header、Footer 和移动导航具有知识库入口。
- [ ] 详情语言切换只指向已发布配对。
- [ ] canonical、参数页 `noindex,follow`、`hreflang`、`TechArticle.inLanguage`、内容时间和 sitemap 正确。
- [ ] 英文文档根节点为 `lang="en"`。
- [ ] 中英文缓存刷新完整。
- [ ] 中文 AI 检索显式限定 `language = 'zh'`。
- [ ] 所有验证命令通过。

### 16.2 内容验收

- [ ] 30 篇中文源稿和 30 篇英文译稿均可追溯。
- [ ] 100% 条目具有摘要、关键词、检索词、来源和下次复核日期；只有存在真实别名时才填写别名。
- [ ] 100% 英文稿与当前中文内容版本同步后再首次发布。
- [ ] 100% 页面至少有 2 条同语言知识内链。
- [ ] 0 条价格、库存或商家短期承诺被写成长青事实。
- [ ] 所有开启 AI 引用的条目都通过本语言检索测试。
- [ ] 随机抽查 10 组双语稿，事实、命令和风险边界一致。

## 17. 发布与回滚

Release A 与 Release B 必须作为两个独立、可验证的发布候选，沿用仓库现有 GitHub Actions 发布链路。普通实施任务只准备并验证发布，不运行本地 Docker 部署脚本，也不自动提交或推送。

发布顺序：

1. 发布 Release A：只修正 AI 默认值、取消发布和 `publishedAt` 兼容语义，不添加旧代码无法满足的严格检查。
2. 确认 Release A 的所有进程生效后，开启知识 CMS 写入维护窗口并发布 Release B：执行双语 expand/backfill/validate/constrain 迁移，再切换语言化 CMS、公开路由、SEO、缓存和 AI 检索代码。
3. Release B 自动验证、人工回归和回滚演练通过后关闭维护窗口；此时仍不得创建英文记录。
4. 平台验收通过后创建 4 组试点，试点通过后才批量生产剩余 26 组。

回滚规则：

- Release B 尚未创建英文记录时，可在保持知识 CMS 写入维护窗口的前提下回退到 Release A；新增列、约束和索引保留，由后续向前迁移处理。Release A 不维护新版本字段，因此回退期间不得编辑知识内容。
- 已存在英文记录后，不得直接回退到没有语言过滤的旧应用，否则英文记录可能出现在中文列表和搜索中。
- 已有英文数据后的应用回滚，必须使用预先保留、仍包含语言过滤和新 schema 兼容性的 Release B 构建；“先下线英文”不能替代代码层语言隔离。
- 不使用破坏性数据库回滚，不删除已发布内容；数据库结构回退通过新的向前迁移完成。

## 18. 风险与控制

| 风险                     | 控制措施                                                                     |
| ------------------------ | ---------------------------------------------------------------------------- |
| 中英文查询串库           | 所有 SQL 强制语言条件并增加反向 slug 404 测试                                |
| 旧译文被误判为最新       | 使用 `contentRevision` 和 `translatedFromRevision`，不比较 `updatedAt`       |
| 首次发布显示旧草稿时间   | 首次发布固定 `publishedAt`，并把 `contentUpdatedAt` 推进到不早于首次公开时间 |
| 后台操作伪造内容更新时间 | 首次公开后独立维护 `contentUpdatedAt`，只由公开正文或 SEO 内容变更更新       |
| 内容修订后继续被 AI 引用 | 任一版本递增关闭自身 AI，中文修订同时关闭配对英文 AI                         |
| 草稿被错误授权给 AI      | AI 默认关闭，并用数据库约束保证授权记录必须已发布                            |
| 并发更新重新授权过期译文 | 专用事务按中文源到英文稿固定锁序，并用版本条件更新                           |
| 已发布英文被直接改稿     | 服务端拒绝修改，必须先取消发布并重新完成同步确认流程                         |
| 严格约束与旧 CMS 冲突    | 先发 Release A 兼容行为，旧进程退出后再由 Release B 添加约束                 |
| 误删中文造成英文孤儿     | 自关联 FK restrict，加 CMS 可读删除错误                                      |
| slug 冲突或发布后失效    | 内容矩阵预登记双 slug，首次发布后锁定                                        |
| 英文内容新增未核验事实   | 英文只使用锁定中文事实链，不二次检索知识库                                   |
| SEO 配对指向草稿         | 只有双方已发布才生成 `hreflang`                                              |
| 英文缓存未刷新           | 缓存目标测试覆盖英文索引和详情                                               |
| 旧应用回滚后串语言       | 英文数据写入前设发布门槛，回滚保留语言过滤兼容层                             |
| 根布局语言错误           | 英文上线前完成静态 root layout 语言改造和全站回归                            |

## 19. 完成定义

只有同时满足以下条件，双语知识库一期才算完成：

1. 平台验收清单全部通过。
2. 30 个双语内容单元全部发布，共 60 个详情页面。
3. 所有已发布配对具有正确 canonical、双向 `hreflang` 和本语言结构化数据。
4. 中英文搜索、推荐、内链、缓存和 AI 检索没有串语言。
5. 内容来源、复核周期和译文同步状态可在 CMS 中持续维护。
6. 自动验证、构建和 4 个试点的人工验收均通过。

## 20. 知识卡片 V1 增量规范

### 20.1 数据与内容边界

`knowledge_articles` 增加三个允许空值的增量字段：

- `definition`：卡片的一句话定义，中英文分别维护。
- `highlights`：JSONB 字符串数组，只允许 2-3 条；推荐使用
  `**重点词**：简短解释` / `**Key term**: concise explanation`。
- `quickTip`：一条可执行的速查、验证或避坑建议。

`summary` 不删除，也不改作卡片文案。它继续服务于 SEO、详情页和 AI
上下文；公开知识列表停止渲染长摘要。分类仍来自
`knowledge_categories` 关系，不在文章行重复保存分类文本。

三个卡片字段都属于公开内容和翻译内容：任一字段变化必须递增
`contentRevision`、更新 `contentUpdatedAt`、撤销本记录 AI 授权；中文卡片
变化还会令配对英文进入待同步并撤销英文 AI 授权。发布和英文同步确认前，
三个字段必须完整。

### 20.2 CMS 与公开渲染

- CMS 使用独立“知识卡片”字段组编辑定义、2-3 条要点和速查，并保留原摘要。
- 中英文稿分别编辑卡片文案，不允许用中文卡片回退填充英文页面。
- 公开卡片顺序固定为：分类与更新时间、标题、定义、核心要点、速查、标签与详情入口。
- 只解析要点开头的受限 `**重点词**` 语法并生成 React 文本节点，禁止使用
  `dangerouslySetInnerHTML`。
- 速查中的反引号代码可以安全渲染为内联代码；其他内容按纯文本处理。
- 卡片和分类速查使用语义色、Lucide 图标、可见焦点态与至少 44px
  的交互高度；移动端不得因表格或固定宽度产生页面横向滚动。
- 知识首页增加分类速查网格；筛选状态保留紧凑分类导航。

### 20.3 首批 60 条卡片数据

30 个知识单元必须同时生成中文和英文卡片，共 60 条。默认转换规则：

1. `definition` 取既有结论的第一句或第一分句。
2. `highlights` 取前三个已审核核心概念，并压缩为重点词加一句解释。
3. `quickTip` 取第一条已审核验证方法。

`KB-017`（IP 标签）、`KB-024`（Nginx 与 HTTPS）和 `KB-030`
（按业务选服务器）使用人工覆盖文案。IP 标签不得写成“住宅 IP 必然低风控”
或“原生 IP 极低风控”等不可验证的绝对结论。

### 20.4 发布顺序与防覆盖

迁移 `0059` 只扩展可空字段和 2-3 条 JSON 数组约束，不在部署迁移中批量修改
生产内容。应用与迁移稳定后，通过
`publish-initial-knowledge.yml` 的 `cards-v1` 阶段执行内容升级，确认串固定为
`REVISE_KNOWLEDGE_CARDS_V1`。

升级命令在第一次写入前必须完成全量预检：

- 正文必须仍精确匹配知识内容 V2。
- 卡片字段只能是全部为空的 V0，或精确匹配生成源的 V1。
- 任何部分填写或人工改写的未知状态都必须停止批处理，禁止覆盖。
- 英文稿先取消发布，再依次保存中文卡片、保存英文卡片、确认翻译同步、重新发布
  并显式恢复中英文 AI 授权。

`audit` 阶段在 V1 上线后要求 60 条记录的正文与卡片均精确匹配。普通代码实施只
准备和验证发布，不直接运行生产迁移、生产内容升级、提交或推送。

### 20.5 卡片验收

- [ ] 60 条记录均具有 1 条定义、2-3 条要点和 1 条速查。
- [ ] 中英文卡片无串语言，英文不回退显示中文字段。
- [ ] 公开卡片不再渲染 `summary`，但 SEO、详情和 AI 仍可使用摘要。
- [ ] 搜索与 AI 候选召回包含定义、要点和速查字段。
- [ ] 要点渲染不注入 HTML，焦点态、暗色模式和移动端布局可用。
- [ ] 分类速查在 375px 宽度下无横向溢出。
- [ ] `cards-v1` 未知内容防覆盖测试、内容校验、迁移校验和构建全部通过。
