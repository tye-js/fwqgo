# FWQGO 移动端适配记录

更新日期：2026-08-23

本轮收尾承接提交 `918fa87`、`426c3d3`，补齐公开库存 `<xl` 卡片功能对等、动态文本断词、共享表格 SSR 移动标签、唯一滚动容器和 AI 任务/媒体入口可达性。

## 当前规则

- CMS 表格横向滚动由 `TableViewport` 拥有；`cms-mobile-sticky-actions` 只负责 1023px 以下卡片化，`cms-table-sticky-actions` 只用于最后一列确实是操作列的表格。
- 320–1024px 关键链接、按钮、summary、输入控件至少 44px。
- URL、Slug、UUID、错误、任务来源、价格、配置和引用完整换行；长摘要才允许有限截断。
- Sheet 关闭按钮、固定保存条和导航使用 safe-area；页面高度使用 `dvh`。

## 验证分层

```bash
bun run verify:public-mobile-ui
bun run verify:cms-mobile-ui
bun run verify:ai-rewrite-prompts
bun run check
SKIP_ENV_VALIDATION=1 bun run build
bun run smoke:mobile
MOBILE_SMOKE_REQUIRE_DATA=1 bun run smoke:mobile
```

真实视口测试依赖 Chromium、已启动 Web/CMS 和可选样本数据。若受到安全策略、Chromium 启动失败或 `EMFILE` 限制，结果必须标记为“真实视口未验证”。

## 问题关闭记录

- 公开站平板控件降高、库存卡片与桌面表格信息对等：已关闭。
- CMS AI 任务详情操作栏换行、图片引用展开、标题与错误动态断词：已关闭。
- CMS 表格 SSR 移动字段标签与滚动 owner 收敛：已关闭。
