import { isRenderableImageSrc } from "./image-src";

export const DEFAULT_ARTICLE_COVER = "/img/placeholders/fwq-placeholder.png";

export function isDefaultArticleCover(value: string | null | undefined) {
  return !value?.trim() || value.trim() === DEFAULT_ARTICLE_COVER;
}

/**
 * 这张封面能不能交给 `next/image` 渲染 —— 后台与前台共用的**唯一**判据。
 *
 * 必须同时满足三件事：有值、不是默认占位图、地址可渲染。少任何一条都出过或会出事故：
 *
 * - **只用 `isRenderableImageSrc`**（它对任何 `/` 开头的路径都返回 `true`）：默认占位图
 *   `/img/placeholders/fwq-placeholder.png` 会被放行，而 `getOptimizedImageSrc` 只改写
 *   `/uploads/` 的路径、其余原样返回，于是 `<Image src="/img/placeholders/…">` 撞上
 *   `apps/<app>/next.config.js` 里 `images.localPatterns` 的白名单（只有 `/api/images/source`
 *   与 `/_next/static/media/**`）→ **服务端渲染直接抛错、整页 500**。
 * - **只用 `isDefaultArticleCover`**：外链、协议相对地址这类不可渲染的值会被放行。
 *
 * 2026-09-25 之前这条判据被各写一套，后台三处漏了占位图检查，导致 `/posts/create`、
 * `/posts/edit`、`/posts/drafts`、`/posts/quality` 在库里存在占位图封面文章时整页 500
 * （而新建草稿的默认封面正是占位图，所以是必现路径）。现在统一走这里，
 * `verify:cms-ui` 会拦住再写一套判据的用法。
 */
export function hasRenderableCover(
  src: string | null | undefined,
): src is string {
  return (
    Boolean(src?.trim()) &&
    !isDefaultArticleCover(src) &&
    isRenderableImageSrc(src)
  );
}
