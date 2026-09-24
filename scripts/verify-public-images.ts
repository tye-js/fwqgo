import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { getOptimizedImageSrc } from "../packages/core/image-src";
import { renderArticleContentHtml } from "../packages/core/content";
import {
  ARTICLE_BODY_IMAGE_SIZES,
  ARTICLE_BODY_IMAGE_SLOTS,
  ARTICLE_IMAGE_MIN_SOURCE_WIDTH,
  ARTICLE_IMAGE_WIDTHS,
  KNOWLEDGE_BODY_IMAGE_SIZES,
  KNOWLEDGE_BODY_IMAGE_SLOTS,
  dprsForViewport,
  optimizeArticleImages,
} from "../src/features/public/lib/article-images";

// A regression on 2026-09-04 stopped routing /uploads/ covers through the image
// optimizer, so every article detail page downloaded its full-resolution cover
// (169 KB for a 724px slot). These assertions keep the optimizer in the path.

// 1. The helper must actually rewrite upload paths onto the allowlisted route.
assert.equal(
  getOptimizedImageSrc("/uploads/cover.webp"),
  "/api/images/source?path=%2Fuploads%2Fcover.webp",
  "Upload paths must route through /api/images/source",
);
assert.equal(
  getOptimizedImageSrc("/uploads/cover.webp", "rev-1"),
  "/api/images/source?path=%2Fuploads%2Fcover.webp&v=rev-1",
  "A revision must be appended so replaced files bust the optimizer cache",
);
assert.equal(
  getOptimizedImageSrc("https://cdn.example/a.webp"),
  "https://cdn.example/a.webp",
  "Non-upload sources must pass through untouched",
);

// 2. next.config must permit the pipeline the helper points at.
const webNextConfig = readFileSync("apps/web/next.config.js", "utf8");
assert.ok(
  webNextConfig.includes('pathname: "/api/images/source"'),
  "images.localPatterns must allow /api/images/source",
);
for (const format of ['"image/webp"', '"image/avif"']) {
  assert.ok(
    webNextConfig.includes(format),
    `images.formats must offer ${format} instead of shipping the stored file`,
  );
}

// 3. No public component may disable the optimizer for stored uploads.
const publicDir = "src/features/public";
const offenders = [];
for (const entry of readdirSync(publicDir, { recursive: true })) {
  const file = path.join(publicDir, String(entry));
  if (!file.endsWith(".tsx") && !file.endsWith(".ts")) continue;
  const source = readFileSync(file, "utf8");
  if (source.includes("unoptimized")) offenders.push(file);
}
assert.deepEqual(
  offenders,
  [],
  "Public images must stay optimizable; unoptimized re-ships full-resolution uploads",
);

// 4. Both public cover paths must send uploads through the helper.
const coverSources = {
  "article cover": "src/features/public/components/article-detail.tsx",
  "article card": "src/features/public/components/safe-post-image.tsx",
};
for (const [label, file] of Object.entries(coverSources)) {
  const source = readFileSync(file, "utf8");
  assert.ok(
    source.includes("getOptimizedImageSrc("),
    `The ${label} must route its source through getOptimizedImageSrc`,
  );
  assert.ok(
    source.includes("sizes="),
    `The ${label} must declare sizes so the browser can pick a variant`,
  );
}

// 5. The article cover must not fall back to the stored path for uploads, which
//    is what silently disabled resizing even while `sizes` stayed in place.
const articleDetail = readFileSync(coverSources["article cover"], "utf8");
assert.ok(
  !/startsWith\("\/uploads\/"\)\s*\?\s*src/.test(articleDetail),
  "The article cover must not serve the stored upload path directly",
);

// 6. 正文图片必须和封面走同一条优化管线。
//
// 正文是用 dangerouslySetInnerHTML 渲染的 HTML 字符串，用不上 next/image 组件，
// 所以富化步骤要手工生成 /_next/image 的 URL。漏掉这一步就是 2026-09-04 那次
// 「封面绕过优化器」的同类回归，而正文栏只有 820px，超采比封面更严重。
const dimensions = { "/uploads/body.webp": { width: 1600, height: 900 } };
// 输入走真实管线：净化器会先写入 1200x675 的 16:9 兜底，富化步骤再覆盖它。
const enriched = optimizeArticleImages(
  renderArticleContentHtml("![正文图](/uploads/body.webp)"),
  dimensions,
  ARTICLE_BODY_IMAGE_SIZES,
);

assert.match(enriched, /\/_next\/image\?url=/, "正文图必须走 /_next/image");
assert.match(enriched, /srcset="/, "正文图必须带 srcset");
// `sizes` 里含 `*`、`(`、`.` 等正则元字符，必须整体转义后再比对，
// 只转义括号会让 `2 * clamp` 里的 `*` 变成量词、断言假失败。
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
assert.match(
  enriched,
  new RegExp(`sizes="${escapeRegExp(ARTICLE_BODY_IMAGE_SIZES)}"`),
  "正文图必须带 sizes",
);
// 真实宽高要覆盖净化器写入的 16:9 兜底，否则竖图与长截图会被框成灰底信箱。
assert.match(enriched, /width="1600"/);
assert.match(enriched, /height="900"/);
assert.doesNotMatch(
  enriched,
  /data-article-image-dimensions="fallback"/,
  "拿到真实尺寸后必须摘掉 16:9 兜底标记",
);

// 没有尺寸记录的图片保留兜底，不能因此丢掉优化器。
const fallback = optimizeArticleImages(
  renderArticleContentHtml("![无尺寸](/uploads/unknown.webp)"),
  dimensions,
  ARTICLE_BODY_IMAGE_SIZES,
);
assert.match(fallback, /\/_next\/image\?url=/);
assert.match(fallback, /data-article-image-dimensions="fallback"/);

// 7. srcset 的宽度必须全部落在 next.config 的 deviceSizes ∪ imageSizes 内。
//    生产环境的 /_next/image 会硬校验 w，不在名单里的值直接 400
//    （`"w" parameter (width) of N is not allowed`），所以这里守着配置与代码不脱节。
const configuredSizes = [
  ...(/deviceSizes:\s*\[([^\]]*)]/.exec(webNextConfig)?.[1]?.split(",") ?? []),
  ...(/imageSizes:\s*\[([^\]]*)]/.exec(webNextConfig)?.[1]?.split(",") ?? []),
]
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isInteger(value));
assert.ok(configuredSizes.length > 0, "未能从 next.config 解析出 deviceSizes");

const articleImagesSource = readFileSync(
  "src/features/public/lib/article-images.ts",
  "utf8",
);
const widthList =
  /ARTICLE_IMAGE_WIDTHS\s*=\s*\[([^\]]*)]/.exec(articleImagesSource)?.[1] ?? "";
const articleWidths = widthList
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isInteger(value));
assert.ok(articleWidths.length > 0, "未能解析出 ARTICLE_IMAGE_WIDTHS");
for (const width of articleWidths) {
  assert.ok(
    configuredSizes.includes(width),
    `正文图宽度 ${width} 不在 deviceSizes/imageSizes 内，/_next/image 会返回 400`,
  );
}

// 7b. 正文图的 `sizes` 必须折算掉正文容器的内边距。
//
// 正文列虽然是 820px，但 `.article-reading-surface` 还有 `padding: clamp(1.1rem,3vw,2.25rem)`，
// 所以正文实际可用宽度是 746px（≥1280）而不是 820px（各断点的实测值见
// `ARTICLE_BODY_IMAGE_SLOTS`）。声明偏大会让浏览器挑更大的变体白传字节：
// 写成 820px 时 ≥1280 会选 828w 而非 750w（多 11% 像素）；写成 100vw 更糟，
// 321px 的槽位会选 640w 而非 384w（多约 1 倍像素）。
//
// 这里只断言像素口径的折算关系——真实字节收益随图片内容变化，写死数字必然失效。
const publicCss = readFileSync("src/styles/public.css", "utf8");
assert.match(
  publicCss,
  /\.public-site \.article-reading-surface\s*\{[^}]*padding:\s*clamp\(1\.1rem,\s*3vw,\s*2\.25rem\)/,
  "正文容器内边距变了：ARTICLE_BODY_IMAGE_SIZES 里的折算要同步",
);
assert.match(
  publicCss,
  /padding-inline:\s*clamp\(1rem,\s*3vw,\s*2rem\)/,
  "版心内边距变了：ARTICLE_BODY_IMAGE_SIZES 里的折算要同步",
);
assert.ok(
  ARTICLE_BODY_IMAGE_SIZES.includes("746px") &&
    ARTICLE_BODY_IMAGE_SIZES.includes("clamp(1.1rem, 3vw, 2.25rem)") &&
    ARTICLE_BODY_IMAGE_SIZES.includes("clamp(1rem, 3vw, 2rem)"),
  `正文图 sizes 必须按正文容器内边距折算，不能直接写列宽或 100vw：${ARTICLE_BODY_IMAGE_SIZES}`,
);

// 7c. srcset 档位必须覆盖「槽位 × 可达 DPR」，而不只是 DPR=1。
//
// 只看 DPR=1 会漏掉真实需求：2x 屏（Retina 笔记本／平板）要的是 slot×2 个物理像素，
// 小视口下的 3x 手机要 slot×3。槽位表是唯一来源，这里按它逐组合断言——
// 槽位改了而档位没跟上时会直接报错。
//
// 「可达 DPR」由 `dprsForViewport` 定义：3x 只存在于视口 ≤480 的设备。不排除这条
// 就会拿「3x + 1280 视口」这种不存在的组合去要求档位，把真实的下限算成 2850px。
const slotTables: Array<
  [string, ReadonlyArray<{ viewport: number; slot: number }>]
> = [
  ["文章", ARTICLE_BODY_IMAGE_SLOTS],
  ["知识库", KNOWLEDGE_BODY_IMAGE_SLOTS],
];
for (const [page, slots] of slotTables) {
  for (const { viewport, slot } of slots) {
    for (const dpr of dprsForViewport(viewport)) {
      const need = Math.round(slot * dpr);
      const chosen = ARTICLE_IMAGE_WIDTHS.find((width) => width >= need);
      assert.ok(
        chosen,
        `${page}正文 ${viewport}@${dpr}x 需要 ${need}px，超过 srcset 最大档位，浏览器只能放大显示（发虚）`,
      );
      // 像素超采上限 1.5：`deviceSizes` 在 1200 与 1920 之间没有可用档位，
      // 「659px 槽位 @2x = 1318 → 只能选 1920」是名单粒度的固有限制，改 srcset 消不掉。
      assert.ok(
        chosen / need <= 1.5,
        `${page}正文 ${viewport}@${dpr}x 需要 ${need}px 却会选 ${chosen}px，多传约 ${Math.round(
          (chosen / need - 1) * 100,
        )}% 像素`,
      );
    }
  }
}

// 7d. 原图宽度下限：既要覆盖所有可达组合，又不能超过 srcset 能提供的最大档位。
//
// 低于下限的原图会被优化器的 `withoutEnlargement` 截住，在大视口 2x 屏上被拉伸显示；
// 而写下超过最大档位的下限没有意义——优化器只按档位生成，多出来的像素永不被服务。
const maxReachableNeed = Math.max(
  ...[...ARTICLE_BODY_IMAGE_SLOTS, ...KNOWLEDGE_BODY_IMAGE_SLOTS].flatMap(
    ({ viewport, slot }) =>
      dprsForViewport(viewport).map((dpr) => Math.round(slot * dpr)),
  ),
);
const maxOfferedWidth = Math.max(...ARTICLE_IMAGE_WIDTHS);
assert.ok(
  ARTICLE_IMAGE_MIN_SOURCE_WIDTH >= maxReachableNeed,
  `原图下限 ${ARTICLE_IMAGE_MIN_SOURCE_WIDTH}px 低于可达需求 ${maxReachableNeed}px：大视口 2x 屏上的正文图会被拉伸`,
);
assert.ok(
  ARTICLE_IMAGE_MIN_SOURCE_WIDTH <= maxOfferedWidth,
  `原图下限 ${ARTICLE_IMAGE_MIN_SOURCE_WIDTH}px 超过 srcset 最大档位 ${maxOfferedWidth}px，多出的像素不会被服务`,
);

// 7e. 知识库正文图同理，而且更容易写错：页面看着有 `max-w-3xl`，但
// `ARTICLE_PROSE_CLASS_NAME` 里的 `max-w-none` 在生成后的 CSS 里胜出，
// 正文实际铺满 `.article-reading-surface`（`max-w-5xl`）的内容区。
assert.ok(
  KNOWLEDGE_BODY_IMAGE_SIZES.includes("clamp(1.1rem, 3vw, 2.25rem)") &&
    KNOWLEDGE_BODY_IMAGE_SIZES.includes("clamp(1rem, 3vw, 2rem)") &&
    KNOWLEDGE_BODY_IMAGE_SIZES.includes("1024px"),
  `知识库正文图 sizes 必须按正文容器内边距折算，不能直接写 768px 或 100vw：${KNOWLEDGE_BODY_IMAGE_SIZES}`,
);

// 8. 净化器只放行站内上传图片：第三方外链图进不了优化器，只会以原始体积直出。
assert.match(renderArticleContentHtml("![本地](/uploads/body.webp)"), /<img/);
for (const external of [
  "![外链](https://evil.example/a.png)",
  "![协议相对](//evil.example/a.png)",
]) {
  assert.doesNotMatch(
    renderArticleContentHtml(external),
    /<img/,
    `正文不应渲染第三方图片：${external}`,
  );
}

// 9. 每个渲染正文 HTML 的地方都必须接上富化步骤，否则新加一条渲染路径就会
//    静默回到裸 <img>。这条扫描比逐个文件断言更耐得住重构。
const renderCallers = [];
for (const entry of readdirSync("src/features/public", { recursive: true })) {
  const file = path.join("src/features/public", String(entry));
  if (!file.endsWith(".tsx") && !file.endsWith(".ts")) continue;
  const source = readFileSync(file, "utf8");
  if (!source.includes("renderArticleContentHtml(")) continue;
  renderCallers.push({ file, source });
}
assert.ok(renderCallers.length > 0, "未找到调用 renderArticleContentHtml 的文件");
for (const { file, source } of renderCallers) {
  assert.ok(
    source.includes("optimizeArticleImages("),
    `${file} 渲染了正文 HTML 却没有接上 optimizeArticleImages，正文图会绕过优化器`,
  );
}

// 10. 抓取路径必须显式丢弃图片。
//
// `htmlToArticleMarkdown` 的默认是 `keep`（漏传 = 保留），方向上是安全的：不会静默
// 丢图。但抓取路径**依赖**显式传 `drop` —— 来源站的第三方图片写进正文后，渲染时会被
// 净化器全部丢掉，只留下一批无效 Markdown。风险点在**新增的抓取调用点**上，所以这里
// 扫描整个 scrape 目录，而不是逐个文件断言。
const scrapeDir = "src/server/scrape";
const scrapeOffenders: string[] = [];
for (const entry of readdirSync(scrapeDir, { recursive: true })) {
  const file = path.join(scrapeDir, String(entry));
  if (!file.endsWith(".ts")) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    // 注释里提到函数名不算调用
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    if (!trimmed.includes("htmlToArticleMarkdown(")) continue;
    if (trimmed.includes('images: "drop"')) continue;
    scrapeOffenders.push(`${file}: ${trimmed}`);
  }
}
assert.deepEqual(
  scrapeOffenders,
  [],
  `抓取路径必须显式传 images: "drop"，否则会把来源站的第三方图写进正文：${scrapeOffenders.join(" | ")}`,
);

console.log(
  "Public image optimizer verified: uploads route through /api/images/source, webp/avif enabled, no public component opts out, scraper drops source-site images.",
);
