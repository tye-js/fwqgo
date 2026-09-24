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
 *
 * 档位要跟正文的实际宽度对齐，太粗会白传字节——实测正文宽度是
 * 321 / 345 / 659 / 757 / 746（见 `ARTICLE_BODY_IMAGE_SIZES`）：
 * - 只有 `[640, 828, 1200, 1920]` 时，390px 下会退而求其次选 640（需要 322，
 *   实测 9,490B vs 384 的 5,642B，多 68%）；≥1280 下选 828（需要 746，
 *   12,666B vs 750 的 11,143B，多 14%）。
 * - 补上 384（imageSizes）与 750（deviceSizes）后，各档都能选到「刚好够用」的那一档。
 */
const ARTICLE_IMAGE_WIDTHS = [384, 640, 750, 828, 1200, 1920] as const;

/** 供守卫断言「档位足够细、能覆盖正文的真实宽度」。 */
export { ARTICLE_IMAGE_WIDTHS };

/** 与 `next/image` 默认质量一致。 */
const ARTICLE_IMAGE_QUALITY = 75;

/** `src` 兜底宽度：正文栏 820px，1200 在 DPR1 下略有富余、不至于明显超采。 */
const ARTICLE_IMAGE_FALLBACK_WIDTH = 1200;

const UPLOAD_SRC_PATTERN = /^(\/uploads\/[^?]+)(?:\?v=([A-Za-z0-9._-]+))?$/;

/**
 * 文章详情页正文的实际可用宽度。
 *
 * 不是 820px：正文列虽然是 820px，但它外面还套着 `.article-reading-surface`，
 * 那个容器有 `padding: clamp(1.1rem, 3vw, 2.25rem)`（`src/styles/public.css`）。
 * 实测正文宽度：390→321 / 414→345 / 768→659 / 1024→757 / ≥1280→746。
 *
 * 声明得偏大会让浏览器挑更大的变体、白传字节：写成 `820px` 时 ≥1280 会选 828w
 * 而不是 750w（同一张图实测 12,666B vs 11,143B，多 14%）；写成 `100vw` 更糟，
 * 390px 下会去选 640w 而不是 384w（9,490B vs 5,642B，多 68%）。
 *
 * `calc` 里的 `clamp` 与版心/正文容器的内边距是**两处独立定义**，改 CSS 时要同步这里。
 * `verify:public-images` 会做行为断言兜住。
 */
export const ARTICLE_BODY_IMAGE_SIZES = `(min-width: 1280px) 746px, calc(min(820px, 100vw - 2 * clamp(1rem, 3vw, 2rem)) - 2 * clamp(1.1rem, 3vw, 2.25rem))`;

/**
 * 知识库详情页正文的实际可用宽度。
 *
 * **不是 768px**：页面虽然给正文加了 `max-w-3xl`，但 `ARTICLE_PROSE_CLASS_NAME`
 * 里带着 Tailwind Typography 的 `max-w-none`，两者在生成后的 CSS 里后者胜出，
 * 正文实际铺满 `.article-reading-surface`（`max-w-5xl`）的内容区。
 * 实测正文宽度：390→321 / 768→659 / 1024→884 / ≥1280→950。
 *
 * 声明成 768px 会**低估**：≥1024 时浏览器选 828w 去填 950px 的槽位，图片被拉伸约 15%
 * （发虚，比多传字节更糟）；断点以下写成 `100vw` 又高估，390px 下选 640w 而非 384w。
 *
 * 结构与文章页同源：`.article-reading-surface` 有 `padding: clamp(1.1rem,3vw,2.25rem)`
 * 与 1px 边框，外层是版心 + `max-w-5xl`。同样地，改 CSS 时要同步这里。
 *
 * `calc` 扣不掉浏览器滚动条（约 15px），所以声明会略大于真实槽位。这个方向是安全的
 * ——宁可多传一点字节，也不要像原来那样低估到发虚。实测 9 档宽度里 8 档命中
 * 「刚好够用」，只有 872px 那一档因为滚动条把值顶过了 750→828 的边界而多选一档。
 */
export const KNOWLEDGE_BODY_IMAGE_SIZES = `calc(min(1024px, 100vw - 2 * clamp(1rem, 3vw, 2rem)) - 2 * clamp(1.1rem, 3vw, 2.25rem) - 2px)`;

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
