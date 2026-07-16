# 上下篇文章最小字段查询规格

- Issue: [#6](https://github.com/tye-js/fwqgo/issues/6)
- 类型: Spec
- 基线: `origin/main@331153534a4c8bff5b72e29fed8dc023568bb307`
- 状态: 待实现

## 1. 背景

中文文章详情页通过 `getPostsByPostId(id)` 获取上一篇和下一篇文章。当前两个 Drizzle 查询使用无参数 `.select()`，会读取 `posts` 表全部字段。

页面导航只渲染相邻文章的标题和链接，但完整行包含中文正文、英文正文、返利质检明细、SEO 文本和图片 URL。正文列为 PostgreSQL `text`，行宽会随文章长度增长。

## 2. 优化目标

把两个相邻文章查询的 SQL 投影缩小为：

- `id`
- `title`
- `slug`

减少数据库读取、网络传输、Node.js 对象分配和 Next.js 缓存值体积，同时保持页面行为和返回结构不变。

## 3. 行为契约

### 3.1 上一篇

- 条件：`posts.id < currentPostId`
- 仅匹配已发布中文文章
- 按 `posts.id DESC`
- 最多一条

### 3.2 下一篇

- 条件：`posts.id > currentPostId`
- 仅匹配已发布中文文章
- 按 `posts.id ASC`
- 最多一条

### 3.3 返回值

- 顺序固定为 `[previousPost, nextPost]`
- 任一方向不存在时返回 `null`
- 每个非空对象只包含导航字段 `id`、`title`、`slug`
- 保留现有错误返回结构

## 4. 实施计划

1. 在 `getPostsByPostId()` 中定义最小字段投影。
2. 两个查询复用相同投影。
3. 不修改调用方和页面组件。
4. 通过 TypeScript 确认调用方没有依赖其他列。
5. 执行 lint、typecheck、测试和双应用生产构建。

## 5. 验收标准

- [ ] `getPostsByPostId()` 内不存在无参数 `.select()`
- [ ] 两个查询只选择 `id`、`title`、`slug`
- [ ] 上一篇过滤、排序和 limit 不变
- [ ] 下一篇过滤、排序和 limit 不变
- [ ] 返回顺序与 null 语义不变
- [ ] 文章详情调用方无需修改
- [ ] 不包含数据库迁移
- [ ] `npm run lint` 通过
- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过
- [ ] `SKIP_ENV_VALIDATION=1 npm run build` 通过

## 6. 风险与回退

该改动不改变查询条件或 UI，风险仅在于调用方可能依赖未投影字段。全仓调用点检查显示页面只访问 `title` 和 `slug`；额外保留 `id` 作为稳定实体标识。

若出现回归，恢复原投影即可，不涉及数据回滚。
