import * as cheerio from "cheerio";

import { getOptimizedImageSrc } from "@fwqgo/core/image-src";

/** 与 `src/server/images/public-image-index.ts` 的返回值结构一致。 */
export type ArticleImageDimensions = Readonly<
  Record<string, { width: number; height: number }>
>;

/**
 * 前台正文槽位的实测宽度：视口 → 正文实际可用宽度（CSS px）。
 *
 * 这是 `sizes` 声明与「原图宽度下限」**共同的来源**。此前同一组数字在
 * `src/features/public/lib/article-images.ts`、`scripts/verify-public-images.ts`
 * 的注释与断言里各写了一份，互不一致；现在都从这里派生。
 * 改 CSS 的列宽或容器内边距时改这里，`verify:public-images` 会拦住脱节。
 */
export const ARTICLE_BODY_IMAGE_SLOTS = [
  { viewport: 390, slot: 321 },
  { viewport: 414, slot: 345 },
  { viewport: 768, slot: 659 },
  { viewport: 1024, slot: 757 },
  { viewport: 1280, slot: 746 },
] as const;

/** 知识库正文槽位。页面看着有 `max-w-3xl`，但 `max-w-none` 胜出，正文铺满容器。 */
export const KNOWLEDGE_BODY_IMAGE_SLOTS = [
  { viewport: 390, slot: 321 },
  { viewport: 768, slot: 659 },
  { viewport: 1024, slot: 884 },
  { viewport: 1280, slot: 950 },
] as const;

/** 需要覆盖的设备像素比。 */
export const ARTICLE_IMAGE_DPRS = [1, 1.5, 2, 3] as const;

/**
 * 某个视口宽度下**真实存在**的设备像素比。
 *
 * 3x 只出现在视口 ≤480 的高端手机；768 以上的视口不会有 3x 设备。
 * 把这条约束写进代码，避免用「3x + 1280 视口」这类不存在的组合去推档位——
 * 那样会得出「原图需要 2850px」的错误结论（真实下限是 1900px）。
 */
export function dprsForViewport(viewport: number) {
  return ARTICLE_IMAGE_DPRS.filter((dpr) => {
    if (dpr === 1) return true;
    if (dpr === 1.5) return viewport <= 1920;
    if (dpr === 2) return viewport <= 1440;
    return viewport <= 480;
  });
}

/**
 * 正文图的原图宽度下限。
 *
 * 优化器的 `withoutEnlargement: true`（`next/dist/server/image-optimizer.js`）
 * 让源文件多小都不放大，**源文件宽度就是这张图的有效分辨率上限**。取所有
 * 「可达槽位 × 可达 DPR」里最大的需求，向上对齐到 srcset 的最大档位：
 * 知识库正文 950px × 2 = 1900 → 1920。
 *
 * 低于它的原图，在 ≥1280 视口的 2x 屏（Retina 笔记本 / 外接 2x 显示器）上会被
 * 拉伸显示。上传端目前只校验上限（8MB），没有下限——这条常量是补上「下限」那一半，
 * 供图片库体检与插入正文弹窗提示使用。
 *
 * 实测（2026-09-24，隔离环境）：同一张封面图的原图 1600px、large 变体 1200px、
 * thumb 变体 400px，经优化器请求 w=1920 分别只能拿到 1600 / 1200 / 400——
 * 变体宽度就是上限，用它当正文图源同样会被截断。
 */
export const ARTICLE_IMAGE_MIN_SOURCE_WIDTH = 1920;

/**
 * `srcset` 只能用 `apps/web/next.config.js` 里 `deviceSizes ∪ imageSizes` 中的宽度。
 *
 * 生产环境的 `/_next/image` 会硬校验 `w`，不在名单里的值直接返回 400
 * （`next/dist/server/image-optimizer.js`：`"w" parameter (width) of N is not allowed`）。
 * 优化器对只给宽度的情况用了 `withoutEnlargement: true`，所以即使原图比候选宽度小
 * 也不会被放大，不需要按原图宽度裁剪候选列表。
 *
 * 档位要跟正文的实际宽度对齐（见 `ARTICLE_BODY_IMAGE_SLOTS`），太粗会白传字节：
 * 只有 `[640, 828, 1200, 1920]` 时，321px 的槽位会退而选 640（多约 1 倍像素）、
 * 746px 的槽位会选 828（多 11% 像素）；补上 384（imageSizes）与 750（deviceSizes）
 * 后各档都能选到「刚好够用」的一档。
 *
 * 这里只写像素口径的比值——它可由槽位与档位直接算出。真实字节收益随图片内容变化，
 * 写死数字必然随时间失效，`verify:public-images` 断言的就是像素口径。
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
 * 各断点的实测值见 `ARTICLE_BODY_IMAGE_SLOTS`。
 *
 * 声明得偏大会让浏览器挑更大的变体、白传字节：写成 `820px` 时 ≥1280 会选 828w
 * 而不是 750w（746px 的槽位多 11% 像素）；写成 `100vw` 更糟，321px 的槽位会去选
 * 640w 而不是 384w（多约 1 倍像素）。
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
 * 各断点的实测值见 `KNOWLEDGE_BODY_IMAGE_SLOTS`。
 *
 * 声明成 768px 会**低估**：≥1024 时浏览器选 828w 去填 950px 的槽位，图片被拉伸约 15%
 * （发虚，比多传字节更糟）；断点以下写成 `100vw` 又高估，321px 的槽位会选 640w
 * 而非 384w。
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
