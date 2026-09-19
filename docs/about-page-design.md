# 「关于我们」页面设计方案

> 状态：待评审 · 未实现
> 路由建议：`/about`（中文）、`/en/about`（英文）
> 设计语言：完全沿用 `html.public-site` 现有 token 与组件类，不引入新变量

---

## 一、页面定位

`/about` 不是企业介绍页，而是一张**信任核验页**。

访客到「关于我们」从来不是因为好奇，而是因为心里有个没被回答的问题。三类动机对应三套完全不同的期待：

| 访客 | 心里的问题 | 页面必须在几秒内回答 |
| --- | --- | --- |
| 首次到访的读者 | 这站是干嘛的？值得花时间看吗？ | 做什么、服务谁、内容从哪来 |
| 老读者 / 准买家 | 推荐链接是不是恰饭？价格数据可不可信？ | 编辑原则、收入来源、价格口径 |
| 商家 / 投稿者 / 纠错者 | 怎么联系？怎么合作？ | 分角色入口，一步到位 |

**设计目标（按优先级）**

1. 10 秒内说清「这是什么站」，不用滚动就能判断是否相关
2. 把「为什么可信」做成页面最厚的一块，而不是结尾一段免责声明
3. 每个区块都留一个明确出口，不留死胡同
4. 视觉零新增——复用 `public-hero` / `public-panel` / `public-kicker` / `public-section-title` / `public-stat`

**明确不做**

- 团队头像墙（无真实素材，虚构人物是信任的净损失）
- 「我们成立于 20XX 年」式企业叙事
- 大图 hero（站点无插画资源，且会拖慢 LCP）
- 任何形式的公司资质罗列

---

## 二、信息架构

九个区块，桌面端控制在 8 屏内。数字为建议顺序，不是硬性目录。

| # | 区块 | 目的 | 优先级 |
| --- | --- | --- | --- |
| 1 | Hero 导语 | 一句话定位 + 双 CTA + 站点速览卡 | P0 |
| 2 | 我们在做什么 | 四张能力卡，把站内四条主线摊开 | P0 |
| 3 | 数据概览 | 用真实数字建立规模感 | P1 |
| 4 | **编辑原则** | 可信度主战场 | P0 |
| 5 | 内容如何产生 | 从采集到发布的流程时间线 | P1 |
| 6 | 我们不做的事 | 边界声明，反向建立信任 | P1 |
| 7 | 联系与协作 | 按角色分四个入口 | P0 |
| 8 | 常见问题 | 折叠问答，承接长尾疑问 | P2 |
| 9 | 页尾 CTA | 回到主路径（比价 / 知识库） | P0 |

### 桌面端布局骨架

```
┌──────────────────────────────────────────────────┐
│ Hero：kicker + h1 + 导语 + 双按钮  │  站点速览卡  │  ← public-hero
├──────────────────────────────────────────────────┤
│ 我们在做什么（4 卡：min-[520px] 2 列 / lg 4 列） │
├──────────────────────────────────────────────────┤
│ 数据概览（3-4 个 metric，一行铺开）              │
├──────────────────────────────────────────────────┤
│ 编辑原则（主内容 1fr）        │ 锚点目录 240px    │  ← xl 起出现
│ 内容如何产生（时间线）        │ sticky            │
│ 我们不做的事（4 条边界）      │                   │
│ 联系与协作（2×2 角色卡）      │                   │
│ 常见问题（accordion）         │                   │
├──────────────────────────────────────────────────┤
│ 页尾 CTA 横幅                                    │
└──────────────────────────────────────────────────┘
```

---

## 三、逐区块设计

### 1. Hero 导语

沿用 `public-hero` 背景（`radial-gradient` 蓝色微光 + 白到页底渐变），容器 `public-container`，两栏 `lg:grid-cols-[minmax(0,1fr)_300px]`，与首页 hero 保持同一节奏，用户不会觉得进了另一个站。

**左栏**

- `public-kicker`：`ABOUT FWQGO`（英文）/ `关于服务器GO`（中文）
- `h1`：`font-editorial`，`text-3xl sm:text-4xl xl:text-5xl`，`max-w-3xl`
  - 中文：**「我们只做一件事：把服务器这件事讲清楚。」**
  - 英文：`We make server decisions easier to verify.`
- 导语 `max-w-2xl text-sm leading-7 md:text-base`：
  - 中文：「服务器GO 是一个独立的服务器选购研究站。我们汇总 VPS、云服务器与独立服务器的公开套餐信息，整理成可筛选、可比较的条目，并用知识库和选购工具补齐判断依据。」
- 两个按钮（`min-h-12`，主按钮 `bg-primary`，次按钮 `border`）：
  - 主：`浏览服务器比价` → `/servers`
  - 次：`打开知识库` → `/knowledge`

> 这里刻意**不放搜索框**。首页 hero 已经承担了搜索入口，关于页的 CTA 应该是「继续了解我们的产出」，而不是重复一次导航。

**右栏：站点速览卡**（`public-panel p-5`）

不是推销位，是事实卡。四行 `dl` 式键值，每行 `min-h-11`：

| 键 | 值 |
| --- | --- |
| 内容语言 | 中文 / English |
| 数据更新 | 跟随商家公开页，滚动更新 |
| 内容范围 | 套餐比价 · 测评 · 知识库 · 选购工具 |
| 联系方式 | contact@fwqgo.com |

底部一行小字说明（`text-xs leading-6 text-muted-foreground`）：「套餐价格、库存与活动条件均以商家结算页为准。」

> 最后这句是全站信任基调的一句话版本，放在首屏，让访客立刻知道我们不会替商家背书。

---

### 2. 我们在做什么

`PublicSectionHeading`，`eyebrow="WHAT WE DO"`，标题「站内四条主线，各解决一个问题」。

四张卡 `grid gap-4 sm:grid-cols-2 xl:grid-cols-4`，每张 `public-panel p-5`：

| 图标（lucide） | 标题 | 说明 | 去向 |
| --- | --- | --- | --- |
| `Server` | 套餐比价 | 把分散在商家页面的价格、地区、线路、库存整理成可筛选条目 | `/servers` |
| `BookOpen` | 测评与指南 | 结合真实使用场景，说明一款套餐适合谁、不适合谁 | `/fwq/page/1` |
| `Cpu` | 选购工具 | 按业务规模估算配置，按访问地区判断线路 | `/tools/server-sizing` |
| `Globe2` | 知识库 | 把配置、线路、机房、IP 这些概念讲成人话 | `/knowledge` |

每张卡：图标 `size-5 text-primary` + 标题 `text-base font-semibold` + 说明 `text-sm leading-6 text-muted-foreground` + 底部 `text-sm font-semibold text-primary` 的「进入」链接带 `ArrowRight`。

整卡可点（`<Link>` 包裹，`a.public-panel:hover` 已有边框高亮与阴影过渡），触达面积远大于 44px。

---

### 3. 数据概览

一行 3–4 个 metric，`grid gap-4 sm:grid-cols-3`，每项用 `public-stat`：

- 收录套餐 **N** 个（`text-3xl font-semibold tabular-nums`）
- 覆盖商家 **N** 家
- 知识库条目 **N** 条
- 文章 **N** 篇

标签用 `text-xs font-medium text-muted-foreground`。

**硬约束**：数字必须来自真实查询。任何一个取不到，就整项不渲染，绝不用占位数字或「100+」这类模糊表述——这一区块存在的唯一理由是可信，一旦掺假就变成负资产。若四项全部取不到，整个区块隐藏，不影响页面完整性。

数据来源见第七节。

---

### 4. 编辑原则（页面核心）

这是整页最重要的一块，视觉上要明显比其他区块「重」，但**不能靠新颜色**，而是靠排版密度和边框。

外层：`public-panel p-6 sm:p-8`，左边缘加一条 `border-l-4 border-primary`（复用文章 `blockquote` 的强调语言）。

标题：`public-kicker` = `EDITORIAL PRINCIPLES`，`h2` 用 `public-section-title` 放大到 `text-2xl`。

内容为四条编号原则，编号用 `public-stat text-lg text-primary/70`（与首页 `ReadingLink` 的 `01/02` 编号一致，用户已经熟悉这个视觉）：

1. **价格与参数只写可核验的。**
   所有套餐信息以商家公开页面为准，我们不改写、不推测、不补全缺失字段。任何价格都会标注抓取时间。
2. **收录不收费，排序不售卖。**
   商家是否被收录、出现在哪个位置，都不接受付费影响。排序依据是地区、价格、线路、库存等可核验字段。
3. **有推广关系就说清楚。**
   含推广链接的内容会在页面上标注。推广不影响该内容的结论，也不影响它是否被收录。
4. **发现错误就改，并留下痕迹。**
   任何人可以通过邮件或社群指出错误，我们核实后修正内容。修正不静默进行。

每条：标题 `text-base font-semibold`，正文 `text-sm leading-7 text-muted-foreground`，条目间 `border-b border-border/70` 分隔，最后一条去边框。

**为什么这四条**：它们分别对应访客最可能的四个怀疑——数据是不是编的、排名是不是买的、推荐是不是恰饭、错了会不会改。逐条正面回答，比任何「我们很专业」都有效。

---

### 5. 内容如何产生

一条纵向时间线，4 步。桌面端左侧时间轴 + 右侧文案（`grid grid-cols-[auto_minmax(0,1fr)] gap-4`），移动端退化为紧凑纵向堆叠。

1. **采集** — 从商家公开页面与公告抓取套餐、价格、库存变化
2. **规范化** — 统一地区、线路、计费周期等字段口径，过滤过期与失效条目
3. **人工复核** — 对关键字段（价格、续费条件、线路）逐条核对
4. **发布与更新** — 内容上线后持续跟随商家变更滚动更新

每步节点用 `size-3 rounded-full bg-primary` 圆点 + 竖线连接（`border-l border-border`），标题 `text-sm font-semibold`，说明 `text-sm leading-6 text-muted-foreground`。

**关键**：这条时间线要诚实。如果第 3 步实际是抽样复核而非逐条复核，文案就必须写「抽样复核」——访客里一定有同行，夸大流程是这类页面最常见的翻车点。

---

### 6. 我们不做的事

四条边界，用 `border-dashed` 卡片或纯列表，视觉上比上一区块「轻」，形成对比。

标题：`eyebrow="BOUNDARIES"`，h2「我们不做这些」。

- 不出售服务器，不代收任何款项
- 不售卖收录位与排名
- 不隐瞒推广关系
- 不发布无法核验的价格与参数

每条前面用 `X` 或 `Minus` 图标（`text-muted-foreground`，不用红色——这不是警告，是划界），文案 `text-sm leading-7`。

> 反向声明比正向承诺更容易被相信。用户对「我们很专业」免疫，但对「我们不赚这笔钱」敏感。

---

### 7. 联系与协作

`grid gap-4 sm:grid-cols-2`，四张角色卡，每张 `public-panel p-5`，结构统一：图标 + 标题 + 一句说明 + 行动链接。

| 角色 | 标题 | 说明 | 行动 |
| --- | --- | --- | --- |
| 读者 | 内容纠错 | 发现价格过期、参数错误或链接失效，直接告诉我们 | `contact@fwqgo.com`（mailto） |
| 作者 | 投稿 | 支持免费投稿，技术向、经验向内容都欢迎 | QQ 群 / Telegram |
| 商家 | 提交优惠 | 提供公开可核验的套餐信息与活动条件 | `contact@fwqgo.com` |
| 合作 | 商务与授权 | 内容授权、数据引用、其他合作事项 | `contact@fwqgo.com` |

QQ 群与 Telegram 复用现有链接（`https://qm.qq.com/q/WCugMBGEso`、`https://t.me/+525xG6tzmbIyN2Fl`），文案与 `WebmasterStatement` 保持一致，避免同一个站出现两种说法。

所有行动链接 `min-h-11`，图标 `size-4 text-primary`。

> 这一区块与文章页底部的 `WebmasterStatement` 是互补关系：文章页那个是即时的免责提示，这里是完整的角色分流。**建议保留 `WebmasterStatement` 不动**，只把它的邮箱与社群链接指向同一批常量，防止后续两处漂移。

---

### 8. 常见问题

`<details>` / `<summary>` 折叠，或复用项目内已有 accordion 组件（优先复用，避免两套交互）。

建议 4–5 条，覆盖真实高频疑问：

- 站上的价格为什么和商家页面不一样？
- 收录商家需要付费吗？
- 你们推荐某个套餐，是有推广关系吗？
- 发现内容有错怎么办？
- 可以转载你们的内容吗？

`summary` 高度 ≥ 44px（`min-h-11`，`cms-theme` 已有类似规则，public 侧需显式给），展开区域 `text-sm leading-7 text-muted-foreground`。

---

### 9. 页尾 CTA

一条 `rounded-2xl border border-primary/15 bg-primary/5 p-6 sm:p-8` 横幅（复用首页侧栏「下单前，再确认三件事」的强调样式）：

- 标题 `text-xl font-semibold`：「接下来，从这两处开始。」
- 两个按钮：`浏览全部套餐` → `/servers`、`进入知识库` → `/knowledge`
- 移动端按钮 `w-full`，桌面端并排

---

## 四、视觉规范（全部为既有 token，无新增）

| 用途 | 取值 |
| --- | --- |
| 页面底色 | `--background: 216 33% 97%` |
| 卡片 | `--card: 0 0% 100%` + `--radius: 1rem` |
| 主色 / 强调 | `--primary: 220 83% 49%` |
| 强调块底色 | `--public-soft: 218 100% 96%` |
| 正文次级文字 | `--muted-foreground: 218 16% 42%` |
| 边框 | `--border: 216 24% 88%` |
| 阴影 | `var(--public-shadow)` = `0 6px 24px hsl(222 40% 22% / 0.035)` |
| 容器 | `.public-container`，max-width 1248px，padding `clamp(1rem, 3vw, 2rem)` |
| 卡片间距 | `gap-4`（16px）为主，区块间距 `space-y-10 md:space-y-14` |
| 字号层级 | h1 `text-3xl→5xl` / 区块 h2 `public-section-title` / 卡片 h3 `text-base` / 正文 `text-sm` |
| 字重 | 650（`.public-section-title`）、600（semibold）、500、400——沿用现有四档 |

**层级靠什么拉开**：不新增颜色，靠 ①卡片内边距（p-5 / p-6 / p-8 三档）②左侧强调条 ③底色深浅（白 / `bg-primary/5` / `bg-muted/20`）④标题字号。

**动效**：仅 hover 时的边框色与阴影过渡（`a.public-panel:hover` 已定义）。不做位移、不做入场动画。全局 `prefers-reduced-motion` 已兜底。

**图标**：统一 lucide-react，`size-4`（行内）/ `size-5`（卡片标题），颜色 `text-primary` 或 `text-muted-foreground`，全部 `aria-hidden`。

---

## 五、响应式

| 断点 | 布局变化 |
| --- | --- |
| 320–519 | 单列。能力卡纵向堆叠，hero 速览卡移到导语下方，按钮 `w-full` |
| 520–767 | 能力卡 2 列；速览卡仍全宽 |
| 768–1023 | 能力卡 2 列，metric 3 列，联系卡 2 列，hero 仍单列（`lg` 起才分栏） |
| 1024–1279 | hero 两栏（1fr + 300px），能力卡 4 列 |
| ≥1280 | 主内容 + 240px sticky 锚点目录 |

**移动端契约（沿用项目约定）**

- 所有可点元素 `min-h-11`（44px）
- 页面不产生横向滚动：`min-w-0` + `break-words`，卡片内长邮箱用 `break-all`
- 锚点目录在移动端**不渲染**，不做横向滚动的 chip 条（横向滚动条在移动端是可用性负担，且与「无横向溢出」约定冲突）

**sticky 目录的两个细节**

- 目录容器 `sticky top-24`，避开 sticky header（`min-h-20` = 80px）
- 所有锚点目标必须带 `scroll-margin-top`（项目已有 `7rem` 的约定值），否则跳转后标题被 header 盖住——这是同类页面最高频的缺陷

---

## 六、可访问性清单

- 语义：`<main id="main-content">` → 每个区块 `<section aria-labelledby={id}>` → `h2`，卡片标题 `h3`；全页仅一个 `h1`
- 目录导航：`<nav aria-label="页面目录">`，当前区块高亮用 `aria-current="true"`（若做滚动监听）
- 跳过链接：复用 header 已有的 `public-skip-link`
- 焦点：全站 `:focus-visible` 已有 `outline: 2px solid hsl(var(--ring)); outline-offset: 3px`，新组件不得覆盖
- 对比度：正文与次级文字用 `text-muted-foreground`（14px 及以上）合格；**不要用 12px + muted-foreground 承载关键信息**，需要 12px 时改用 `text-foreground`
- 折叠项：`<summary>` 可键盘操作，展开状态不依赖颜色
- 图标：装饰性图标 `aria-hidden="true"`；纯图标链接必须有 `aria-label`
- 链接文案：不使用「点击这里」，所有链接文本独立可读（读屏用户会跳读链接列表）

---

## 七、数据依赖与降级

| 区块 | 数据源 | 取不到时 |
| --- | --- | --- |
| 数据概览 | 套餐数：复用首页 `totalOfferCount`（`getServerOfferTopicCounts` 聚合）；商家数：`getServerOfferCollectionIndex().providers` 计数；知识库条目：`listPublishedKnowledgeArticles` 计数 | 单项不渲染；四项全空则整区块隐藏 |
| 文章数 | 需要新增一个轻量 count 查询（或复用文章列表接口的 total） | 同上 |
| 其余区块 | 纯静态文案 | 无依赖 |

**性能要求**

- 页面本身是静态内容，应走 `"use cache"` + `cacheLife` + `tagCache`，与站点其他公开页一致；**不要在页面组件里做请求相关计算**
- 统计数字若接入缓存，需纳入现有 cache tag 失效体系（`packages/cache/tags.ts`），否则商家新增套餐后数字会长期不更新
- 关于页不涉及文章正文渲染管线，无需走 `renderArticleContentHtml` 那一套

---

## 八、双语方案

`/about` 与 `/en/about` 双路由，文案全部走 `Record<PublicLanguage, ...>` 常量，与 `headerCopy` / `footerCopy` 现有写法一致。

- 语言切换由现有 `LanguageSwitchLink` 处理（需要为 `/about` 补充语言映射，否则切换会掉回首页）
- `hreflang` alternate 与 sitemap 需同时收录两个路径
- 英文页不要直译中文口号，按英文语感重写（示例见第三节 hero）

---

## 九、导航入口

关于页是低频但高信任价值的页面，**不建议挤进主导航**（桌面端导航已有 6 项，xl 才展开，再加会明显拥挤）。

推荐三处入口：

1. **页脚**「联系与说明」组新增「关于我们」——页脚已有该分组，加一条成本最低
2. **移动端 Sheet 导航**底部新增一条（`min-h-11`，与现有条目同款）
3. **文章页底部的 `WebmasterStatement`** 中，把「联系方式」段落补一句「更多说明见关于我们」并链到 `/about`

---

## 十、待确认的决策点

| # | 决策 | 建议 | 备选 |
| --- | --- | --- | --- |
| 1 | 路径 | `/about` | `/about-us` |
| 2 | 是否做 sticky 锚点目录 | 做，仅 ≥1280px | 完全不做，线性阅读 |
| 3 | 数据概览区块 | 保留，但允许整块隐藏 | 砍掉，用定性描述替代 |
| 4 | 联系与协作的四个角色 | 四卡 | 合并为「联系」+「投稿」两卡 |
| 5 | 常见问题 | 保留 4–5 条 | 砍掉，内容并入编辑原则 |
| 6 | 是否展示团队信息 | 不展示 | 展示「编辑团队」文字说明（不带头像） |

---

## 十一、后续实现清单（本轮不做）

1. `src/features/public/routes/about/page.tsx` + `routes/en/about/page.tsx`
2. `apps/web/src/app/about/page.tsx` 等 re-export 路由文件
3. `src/features/public/components/about-page.tsx`（`language` prop 驱动，与 `home-page.tsx` 同构）
4. 若确认数据概览：补 count 查询 + 缓存 tag 接入
5. `LanguageSwitchLink` 补充 `/about` 映射
6. 页脚 + 移动端导航入口
7. sitemap / hreflang 收录
8. `scripts/` 下补一条跨文件契约守卫（若涉及新常量或缓存 tag）
