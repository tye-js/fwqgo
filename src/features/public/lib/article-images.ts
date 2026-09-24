import * as cheerio from "cheerio";

import { getOptimizedImageSrc } from "@fwqgo/core/image-src";

/** 与 `src/server/images/public-image-index.ts` 的返回值结构一致。 */
export type ArticleImageDimensions = Readonly<
  Record<string, { width: number; height: number }>
>;

/**
 * `srcset` 只能用 `apps/web/next.config.js` 里 `deviceSizes ∪ imageSizes` 中的宽度。
 *
 * 生产环境的 `/_next/image` 会硬校验 `w`，不在名单里的值直接返回 400
 * （`next/dist/server/image-optimizer.js`：`"w" parameter (width) of N is not allowed`）。
 * 优化器对只给宽度的情况用了 `withoutEnlargement: true`，所以即使原图比候选宽度小
 * 也不会被放大，不需要按原图宽度裁剪候选列表。
 */
const ARTICLE_IMAGE_WIDTHS = [640, 828, 1200, 1920] as const;

/** 与 `next/image` 默认质量一致。 */
const ARTICLE_IMAGE_QUALITY = 75;

/** `src` 兜底宽度：正文栏 820px，1200 在 DPR1 下略有富余、不至于明显超采。 */
const ARTICLE_IMAGE_FALLBACK_WIDTH = 1200;

const UPLOAD_SRC_PATTERN = /^(\/uploads\/[^?]+)(?:\?v=([A-Za-z0-9._-]+))?$/;

/**
 * 文章详情页正文栏：`xl` 起是 `minmax(0, 820px)` 的固定列，断点以下单列铺满。
 * 必须与路由里的栅格保持一致，否则浏览器会按错误的宽度挑图。
 */
export const ARTICLE_BODY_IMAGE_SIZES = "(min-width: 1280px) 820px, 100vw";

/** 知识库详情页正文：`mx-auto max-w-3xl`（768px），外侧仍有版心内边距。 */
export const KNOWLEDGE_BODY_IMAGE_SIZES = "(min-width: 832px) 768px, 100vw";

function optimizedImageUrl(localSrc: string, width: number) {
  return `/_next/image?url=${encodeURIComponent(localSrc)}&w=${width}&q=${ARTICLE_IMAGE_QUALITY}`;
}

/**
 * 把正文 HTML 里的站内上传图片接进 `next/image` 的优化器。
 *
 * 正文是用 `dangerouslySetInnerHTML` 渲染的字符串，用不上 `next/image` 组件，
 * 所以这里手工生成 `/_next/image` 的 URL 与 `srcset`/`sizes`。不做这一步，
 * 正文图就是裸 `<img>` 直出原始体积——正是 2026-09-04 那次「封面绕过优化器、
 * 724px 的槽位下载 169KB 全尺寸图」的同类回归（见 `scripts/verify-public-images.ts`），
 * 而正文栏只有 820px，超采更严重。
 *
 * 同时注入 `imageAssets` 里的真实宽高：净化器在缺尺寸时写入的 1200x675 兜底
 * 会把每张图框成 16:9 灰底信箱，竖图与长截图尤其明显。
 */
export function optimizeArticleImages(
  html: string,
  dimensions: ArticleImageDimensions,
  sizes: string,
) {
  // 正文没有图片时（当前全部文章都是这种情况）直接返回，省掉一次 cheerio 解析。
  if (!html.includes("<img")) return html;

  const $ = cheerio.load(html, null, false);

  $("img[src]").each((_, element) => {
    const $image = $(element);
    const match = UPLOAD_SRC_PATTERN.exec($image.attr("src")?.trim() ?? "");

    // 净化器只放行站内上传路径（`isSafeArticleImageSrc`），这里的兜底分支
    // 正常情况下走不到。真走到了说明有图片绕过了净化器，留在原地比静默删掉好。
    if (!match) return;

    const [, path, revision] = match;
    if (!path) return;

    const localSrc = getOptimizedImageSrc(path, revision ?? null);
    const dimension = dimensions[path];

    if (dimension) {
      $image.attr("width", String(dimension.width));
      $image.attr("height", String(dimension.height));
      // 拿到真实尺寸后必须摘掉兜底标记，否则样式表仍会套上
      // `aspect-ratio: 16/9; object-fit: contain` 的信箱。
      $image.removeAttr("data-article-image-dimensions");
    }

    $image.attr("src", optimizedImageUrl(localSrc, ARTICLE_IMAGE_FALLBACK_WIDTH));
    $image.attr(
      "srcset",
      ARTICLE_IMAGE_WIDTHS.map(
        (width) => `${optimizedImageUrl(localSrc, width)} ${width}w`,
      ).join(", "),
    );
    $image.attr("sizes", sizes);
  });

  return $.html();
}
