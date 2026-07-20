# 删除不可达公开数据 API 规格

- Issue: [#9](https://github.com/tye-js/fwqgo/issues/9)
- 类型: Spec
- 基线: `origin/main@331153534a4c8bff5b72e29fed8dc023568bb307`
- 状态: 待实现

## 1. 背景

公开数据层仍导出以下旧函数，但全仓静态引用只命中定义本身：

- `getPostByCategoryId`
- 公开版 `getPostBySlug`
- `getTagList`
- `getTagCount`
- `getTagSearchList`

当前公开路由已使用分页分类查询、组合文章详情查询和标签页面查询；CMS 使用独立的管理数据层。旧函数不再属于任何可达运行路径。

## 2. 优化目标

删除不可达函数及其过时的缓存验证要求，使公开数据模块只暴露真实使用的 API，降低重复查询逻辑、无界读取和误用旧接口的风险。

## 3. 删除范围

### `src/features/public/data/post.ts`

删除：

- `getPostByCategoryId`
- `getPostBySlug`

保留：

- 内部使用的 `getPostsWithTags`
- `getPostWithTagsBySlug`
- `getEnglishPostWithTagsBySlug`
- 分类分页、搜索、首页和侧栏查询
- CMS 中独立定义的同名 `getPostBySlug`

### `src/features/public/data/tag.ts`

删除：

- `getTagList`
- `getTagCount`
- `getTagSearchList`

保留：

- `getTagBySlug`
- `getPostsWithTagsByTagSlug`
- `findBestTagMatch`，该函数仍由 CMS 标签搜索 API 使用

### `scripts/verify-public-cache-boundaries.ts`

从缓存函数要求中移除公开版 `getPostBySlug`。其余真实公开数据函数继续受验证器保护。

## 4. 行为约束

- 不修改任何路由或组件。
- 不修改 CMS 数据层。
- 不修改数据库 schema 或迁移。
- 不改变真实公开查询的缓存标签和过期策略。
- 不新增替代 API；现有可达调用已完成迁移。

## 5. 实施计划

1. 删除明确的函数代码块。
2. 更新缓存验证清单。
3. 全仓搜索函数名称，区分 CMS 同名函数。
4. 运行缓存边界验证。
5. 运行 lint、typecheck、测试和完整构建。

## 6. 验收标准

- [ ] 公开 `post.ts` 不再定义 `getPostByCategoryId`
- [ ] 公开 `post.ts` 不再定义 `getPostBySlug`
- [ ] 公开 `tag.ts` 不再定义三个旧列表函数
- [ ] CMS `getPostBySlug` 和其调用方保持不变
- [ ] `findBestTagMatch` 保持可用
- [ ] 缓存验证器只包含真实可达函数
- [ ] 公开 Web/CMS 路由边界数量不变
- [ ] `bun run lint` 通过
- [ ] `bun run typecheck` 通过
- [ ] `npm test` 通过
- [ ] `bun run verify:cache` 通过
- [ ] `SKIP_ENV_VALIDATION=1 bun run build` 通过

## 7. 风险与回退

主要风险是隐藏的动态引用。当前仓库通过静态 TypeScript import 使用数据函数，未发现按函数名动态加载机制；TypeScript 和完整 App Router 构建可覆盖路由依赖。

若发现遗漏，恢复对应函数即可，无数据回滚要求。
