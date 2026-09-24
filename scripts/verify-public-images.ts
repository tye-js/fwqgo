import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { getOptimizedImageSrc } from "../packages/core/image-src";
import { renderArticleContentHtml } from "../packages/core/content";
import {
  ARTICLE_BODY_IMAGE_SIZES,
  ARTICLE_IMAGE_WIDTHS,
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
// 所以正文实际可用宽度是 746px（≥1280）而不是 820px。声明偏大会让浏览器挑更大的变体白传字节：
// 实测写成 820px 时 ≥1280 会选 828w 而非 750w（28,720B vs 25,191B，多 14%）；
// 写成 100vw 更糟，390px 下会选 640w 而非 384w（约 2 倍）。
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

// 7c. srcset 档位必须够细，能覆盖正文的真实宽度。
//
// 正文槽位实测为 321 / 345 / 659 / 757 / 746。档位太粗会白传字节——只有
// [640, 828, 1200, 1920] 时，390px 会退而选 640（需要 322，多 55% 字节），
// ≥1280 会选 828（需要 746，多 12%）。补上 384 与 750 后各档都能选到刚好够用的一档。
for (const slot of [321, 345, 659, 757, 746]) {
  const chosen = ARTICLE_IMAGE_WIDTHS.find((width) => width >= slot);
  assert.ok(chosen, `srcset 里没有能覆盖 ${slot}px 正文槽位的档位`);
  assert.ok(
    chosen / slot <= 1.25,
    `srcset 档位太粗：${slot}px 的正文槽位会选到 ${chosen}px，多传约 ${Math.round((chosen / slot - 1) * 100)}% 像素`,
  );
}

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

console.log(
  "Public image optimizer verified: uploads route through /api/images/source, webp/avif enabled, no public component opts out.",
);
