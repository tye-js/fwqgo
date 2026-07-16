# 供应商官网套餐采集设计

状态：实现完成，待随发布执行生产迁移  
日期：2026-07-16

## 1. 目标

服务器套餐以供应商官网、公开 API 或官方购物车为事实来源，不再从文章正文提取。系统需要完成：

1. 从供应商配置的官方采集源发现套餐。
2. 提取稳定产品标识、配置、价格、库存、地区和购买链接。
3. 按供应商稳定产品键幂等写入，重复采集只更新同一套餐。
4. 新套餐先进入候选审核；已审核套餐按字段锁自动同步。
5. 供应商连续多次不再返回某套餐后，才将其标记为停售。
6. 购买链接写入前应用该供应商的返利配置。
7. 文章只作为测评、提及或优惠说明与套餐关联，不再参与套餐识别。
8. 所有采集运行进入持久后台队列，并能在 CMS 和任务中心定位失败原因。

## 2. 非目标

- 不构建一个依赖 AI 的通用网页套餐识别器。
- 不在每次定时采集中调用大模型。
- 不因为官网一次请求失败或一次缺少产品就删除套餐。
- 不自动覆盖后台人工锁定的字段。
- 不把来自文章的旧套餐直接删除。

## 3. 现有能力复用

继续使用：

- `aff_service_providers`：供应商、官网和返利配置。
- `provider_monitors`：扩展为供应商采集源，保留现有定时调度能力。
- `server_offers`：套餐主记录。
- `server_offer_prices`：多周期价格。
- `server_offer_checks`：库存和价格检测历史。
- `server_offer_sources`：官网来源和文章关系。
- `admin_background_jobs`：持久队列、锁、心跳和失败重试。
- `lockedFields`：人工字段保护。

停止新增：

- `server_offer_import_tasks` 文章提取任务。
- AI 改写完成后的文章套餐提取步骤。

旧任务和旧文章来源只保留审计，不在迁移中物理删除。

## 4. 总体架构

```text
供应商采集源
  -> HTTP 获取（JSON / HTML / WHMCS）
  -> 响应大小、类型、超时和 SSRF 校验
  -> 供应商级确定性字段映射
  -> 标准化套餐候选
  -> 必填字段质量门槛
  -> 返利链接规范化
  -> providerId + externalProductId 幂等匹配
      -> 新套餐：候选审核
      -> 已有套餐：同步未锁定字段
  -> 记录运行、来源、价格和库存检查
  -> 连续缺失计数与停售判定
  -> 公共缓存失效
```

## 5. 采集源和适配器

一个供应商可以配置多个采集源，例如常规产品、限时优惠和库存接口分别采集。

### 5.1 JSON

适用于公开 API、前端接口和嵌入式产品接口。

- 使用点路径读取产品数组和字段。
- 支持一个产品包含多个价格周期。
- 支持状态映射和默认字段。
- 支持有限的自定义请求头，但禁止 Cookie、Host、代理鉴权等危险头。

### 5.2 HTML

适用于服务端渲染的产品列表或购物车页面。

- 使用 `itemSelector` 定位套餐块。
- 每个字段使用 CSS 选择器、属性名和可选正则提取。
- 相对购买链接基于采集页解析成绝对 URL。
- 不依赖页面文案相似度去重。

### 5.3 WHMCS

WHMCS 是 HTML 适配器的预设，提供常见产品卡片、PID 和购物车链接默认映射。

- 优先从 `pid`、`gid`、产品 URL 或 DOM data 属性获取稳定 ID。
- 供应商主题不同时允许覆盖默认选择器。
- 产品地区或变体需要进入稳定键，避免不同机房被合并。

### 5.4 Browser

浏览器采集只作为后续可选后备：

- 页面必须执行 JavaScript 且没有可调用接口时才启用。
- 仍然使用供应商级选择器，不使用通用 AI 识别。
- 独立低并发队列，限制页面数、资源类型和执行时长。

第一期验收不要求 Browser 自动执行。

## 6. 标准套餐候选

适配器统一输出：

```ts
type ProviderOfferCandidate = {
  externalProductId: string;
  title: string;
  productGroup?: string;
  productType: string;
  cpu?: string;
  memory?: string;
  storage?: string;
  bandwidth?: string;
  traffic?: string;
  region?: string;
  countryCode?: string;
  city?: string;
  lineType?: string;
  network?: string;
  ipv4?: string;
  ipv6?: string;
  status?:
    | "in_stock"
    | "out_of_stock"
    | "restocking"
    | "discontinued"
    | "preorder";
  purchaseUrl: string;
  promoCode?: string;
  prices: Array<{
    amount: string;
    originalAmount?: string;
    currency: string;
    billingCycle: string;
    purchaseUrl?: string;
  }>;
  sourceUrl: string;
  raw: Record<string, unknown>;
};
```

质量门槛：

- 必须有稳定产品 ID、标题和购买链接。
- 必须至少有一个可折算价格。
- CPU、内存、存储、带宽、流量中至少识别两个配置字段。
- 不满足门槛的项目计入 `skipped`，保留可读失败原因，不写入套餐库。

## 7. 身份和去重

主身份键：

```text
providerId + externalProductId
```

规则：

- 优先使用供应商 API 产品 ID、WHMCS PID 或官方稳定产品键。
- 没有显式 ID 时使用规范化官方产品 URL 路径。
- 多机房或规格变体如果共享产品 ID，适配器必须组成 `productId:variantId`。
- CPU、内存、价格等可变属性不能作为身份键。
- 相同身份键只允许一个 `server_offers` 主记录。

`sourceHash` 由影响同步的标准化字段和返利配置生成。响应哈希与采集配置指纹分别保存；只有页面、字段映射、返利和同步策略均未变化时才短路，仍会刷新最后出现时间。

## 8. 同步和审核策略

新套餐：

- 写入 `provider_offer_candidates`。
- 默认 `pending`，不公开。
- 审核通过后物化为 `server_offers`。
- 采集源明确开启 `autoPublish` 时可以直接物化，但默认关闭。

已有套餐：

- 自动同步库存、价格、购买链接和最后检测时间。
- 标题、套餐属性、配置规格、地区线路、优惠码可分组锁定，未锁定时随官网更新。
- 核心规格发生变化时保存差异记录，后台可追踪；人工编辑或解锁会使条件缓存失效，确保下一轮重新同步。
- `lockedFields` 中的字段始终保留人工值。

候选状态：

```text
pending -> accepted
pending -> rejected
pending -> superseded（同一产品更新候选版本）
```

拒绝记录保留，后续相同 `sourceHash` 不重复提醒；官网内容变化后可重新进入待审核。

## 9. 缺失和停售

- 只有一次采集成功后，才计算本轮缺失。
- 请求失败、解析失败或返回异常数量时不增加缺失次数。
- 同一采集源连续 `missingThreshold` 次缺失，默认 3 次，标记 `discontinued`。
- 产品重新出现时清零缺失次数并恢复官网状态。
- 人工锁定 `status` 后，采集器只记录检测结果，不改变状态。

## 10. 返利链接

购买链接在标准化后、写入前处理：

- 按当前采集源所属供应商直接使用返利配置，不再次跨供应商查询。
- `affParam === "href"`：整条替换为数据库 `affUrl`，保持现有行为。
- 其他参数：只更新该 query 参数，保留路径和其他参数。
- 多周期价格各自的购买链接分别处理，不能统一成同一个普通参数链接。
- 同时保留官网原始来源 URL 用于审计，不把返利链接当作来源 URL。

## 11. 数据模型

### provider_monitors 扩展

- `purpose`: `catalog | promotion | stock`
- `adapter`: `json | html | whmcs`
- `autoPublish`: boolean，默认 false
- `missingThreshold`: integer，默认 3
- `etag`、`lastModified`、`responseHash`
- `lastSummary`: jsonb

### provider_monitor_runs

- 运行状态、开始/结束时间、响应哈希和 HTTP 信息。
- received、created、updated、unchanged、skipped、missing 统计。
- 错误标题、错误详情。

### provider_offer_candidates

- monitorId、providerId、externalProductId 唯一。
- sourceUrl、sourceHash、normalizedData、diff。
- status、offerId、首次/最后发现、审核人和审核时间。

### server_offers 扩展

- `sourceMonitorId`
- `sourceHash`
- `sourceLastSeenAt`
- `missingRuns`

### server_offer_sources 扩展

- 官网来源使用 `sourceType=provider`。
- 文章使用 `sourceType=article`。
- 增加 `relationType=review | mention | deal`。
- 文章关系唯一键改为 `offerId + sourcePostId + relationType`，允许一个套餐关联多篇文章。

## 12. CMS 信息架构

`/servers`：重定向到供应商采集，不再显示文章选择器。  
`/servers/monitor`：改名为“供应商采集”，包含：

1. 采集源列表：供应商、类型、适配器、计划、最近状态。
2. 新增/编辑配置：URL、适配器、映射、默认值和自动发布策略。
3. 测试采集：只解析并展示前若干候选，不写数据库。
4. 待审核候选：差异、通过、拒绝和关联现有套餐。
5. 运行记录：统计、耗时和可读错误。

套餐管理页继续负责人工校正、字段锁、上下架、精选和文章关联。

AI 任务中心：

- “套餐提取”改为“供应商采集”。
- 展示采集源、供应商、received/created/updated/skipped、错误和详情入口。
- 支持失败重试；定时任务由现有持久队列调度。

## 13. 旧流程迁移

1. 先停止 AI 改写后的文章套餐提取。
2. 停止创建单篇和历史文章提取任务。
3. 旧 `server_offer_import_tasks` 只读保留。
4. 旧套餐保持可见状态，不自动删除。
5. 官网采集命中旧套餐时，按供应商、官方产品 ID、规范化购买 URL进行人工或确定性合并。
6. 原 `sourcePostId` 和文章来源迁移为文章关联。

## 14. 安全与性能

- 所有 URL 使用现有公网 URL 校验，阻止内网、回环和云元数据地址。
- 单响应最大 8 MB，单次最多 5000 个产品。
- HTTP/HTML 优先，不自动启动浏览器。
- 支持 ETag、Last-Modified 和响应哈希，无变化时短路。
- 同一采集源同一时间只运行一个任务。
- 请求超时、重试和执行间隔均有上限。
- 原始响应不长期保存；候选只保存标准化数据和受限 raw 摘要。

## 15. 验收标准

1. AI 改写和 CMS 均不能再创建文章套餐提取任务。
2. JSON、HTML 和 WHMCS fixture 均可提取配置、价格和购买链接。
3. 同一采集源连续执行两次，不产生重复套餐或重复候选。
4. 不同购买链接保持独立；返利参数模式只改目标参数；`href` 模式整条替换。
5. 新套餐默认待审核且不可见，审核通过后进入套餐库。
6. 已有套餐价格和库存可以自动更新，锁定字段不被覆盖。
7. 成功采集中连续缺失达到阈值后停售；失败采集不增加缺失次数。
8. 一个套餐可以关联多篇测评文章。
9. 采集运行可在 CMS 和任务中心定位统计、耗时和失败原因。
10. 数据库迁移、单元测试、lint、typecheck 和 Web/CMS 构建通过。
