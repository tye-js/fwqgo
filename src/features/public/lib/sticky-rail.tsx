/**
 * 跟随滚动的侧栏（右栏 / 筛选栏 / 工具侧栏）的版面契约。
 *
 * ## 为什么吸顶偏移和高度上限必须绑在一起
 *
 * `position: sticky` 的元素一旦比视口高，被钉住之后**底部永远滚不出来** ——
 * 它不再跟随页面滚动，而页面继续滚。用户看不到，整页截图也看不出来
 * （截图会把视口外的部分一起画出来），所以这个缺陷只能靠量高度发现。
 *
 * 2026-09-24 实测（1280×900，视口可用高 804px）：
 *
 * | 页面 | 侧栏高度 | 后果 |
 * | --- | --- | --- |
 * | `/fwq/page/1` 全部文章右栏 | 1061px | 底部 **273px** 永久不可达 |
 * | `/fwq/<分类>/page/1` 分类页右栏 | 911px | 底部 **123px** 不可达 |
 * | `/servers` 厂商筛选栏 | 807px | 超出视口 3px |
 *
 * 三处都只写了 `sticky top-*`，漏了高度上限；同一个不变式在前台被重复实现了
 * 7 次，只有文章详情页那次记住了。所以这里把它收敛成唯一来源。
 *
 * **不要在页面里直接写 `sticky`**，一律用下面的常量。
 * `scripts/verify-public-mobile-ui.ts` 会拦住漏用的写法。
 *
 * ## 扣减量必须跟着偏移走
 *
 * `max-height` 的扣减 = 吸顶偏移 + 一点余量，只改偏移不改扣减等于没修：
 *
 * - `top-24`（6rem = 96px）→ `calc(100dvh - 7rem)`，多留 1rem 余量
 * - `top-28`（7rem = 112px）→ `calc(100dvh - 8rem)`
 *
 * 这里统一用 `top-24`：实测页头高 81px，96px 偏移留出 15px 间隙；
 * 分类页原先的 `top-28` 与标签页、工具页、文章页的 `top-24` 不一致，属历史漂移。
 *
 * ## 两个容易踩的实现约束
 *
 * 1. **本文件必须是 `.tsx`。** `tailwind.config.ts` 的 `content` 只覆盖 `src` 下的
 *    `.tsx`（不含 `.ts`）。常量挪进 `.ts` 的话，Tailwind 根本看不到
 *    这些类名，样式不会生成，修复会**静默失效**（页面看着「没报错但也没变」）。
 *    仓库里另外两个类名常量（`ARTICLE_PROSE_CLASS_NAME`、`DEFAULT_NAV_CLASS_NAME`）
 *    也都住在 `.tsx` 里，正是这个原因。
 * 2. **类名必须写完整字面量。** Tailwind 是在源码里做子串匹配的，用模板拼断点前缀
 *    （`` `${bp}:sticky` ``）拼出来的 `xl:sticky` 扫不到，同样不会生成样式。
 *
 * ## 为什么是常量而不是组件
 *
 * 调用方的视觉容器差异很大（有的是一张带边框的卡、有的是 `space-y` 分栏、
 * 有的在 `lg` 断点就出现），抽成组件反而要引入一堆 props。常量只承载
 * 「不可省略的那几个类」，其余留给调用方。
 */

/** `xl` 起出现，吸顶 6rem。列表页 / 分类页 / 标签页右栏用。 */
export const STICKY_RAIL_XL =
  "xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto xl:overscroll-contain";

/** `lg` 起出现，吸顶 6rem。库存厂商筛选栏、工具页侧栏用。 */
export const STICKY_RAIL_LG =
  "lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain";
