# Sitemap lastmod 真实性规格

- Issue: [#12](https://github.com/tye-js/fwqgo/issues/12)
- 类型: Spec
- 基线: `origin/main@331153534a4c8bff5b72e29fed8dc023568bb307`
- 状态: 待实现

## 1. 背景

当前 sitemap formatter 将空值和无效日期替换为请求时的当前时间，服务器 sitemap 在没有套餐更新时间时也使用 `new Date()`。这些 fallback 会为没有实际内容更新的 URL 生成持续变化的 `<lastmod>`。

## 2. 目标

`<lastmod>` 只在存在可信、可解析的时间时输出：

- 有效 `Date`、日期字符串和数字时间戳转换为 ISO 8601。
- `null`、`undefined` 和无效日期返回空结果。
- entry renderer 在空结果时完全省略 `<lastmod>`。
- 服务器 sitemap 不使用当前请求时间作为 fallback。

## 3. 设计

新增独立纯函数模块 `packages/core/sitemap-lastmod.ts`：

- `formatSitemapLastmod(value)` 返回 `string | null`
- `renderSitemapLastmod(value)` 返回完整元素或空字符串

公开 sitemap 路由复用该 helper。XML 缩进由路由负责，helper 不读取环境、数据库或请求状态。

## 4. 行为约束

- URL、alternate、changefreq、priority 不变。
- sitemap index 和 urlset 命名空间不变。
- Content-Type 与 Cache-Control 不变。
- 已有真实 `updatedAt` / `createdAt` 继续输出。
- 不用当前时间替代缺失或损坏的数据。

## 5. 测试

单元测试覆盖：

1. Date。
2. ISO 字符串。
3. 数字时间戳。
4. null。
5. undefined。
6. 无效字符串。
7. Invalid Date。
8. 空值渲染不产生 XML 元素。

## 6. 验收标准

- [ ] 缺少真实日期时省略 `<lastmod>`
- [ ] 有效日期输出稳定 ISO 8601
- [ ] 服务器 sitemap 删除 `new Date()` fallback
- [ ] XML 其他字段和缓存头不变
- [ ] 新增纯函数单元测试
- [ ] `npm run lint` 通过
- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过
- [ ] `SKIP_ENV_VALIDATION=1 npm run build` 通过

## 7. 风险与回退

省略 `lastmod` 符合 sitemap 协议。若搜索引擎或内部工具出现兼容问题，可恢复 formatter；无数据库和内容数据回滚。
