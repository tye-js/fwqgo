import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { getOptimizedImageSrc } from "../packages/core/image-src";
import { renderArticleContentHtml } from "../packages/core/content";
import {
  ARTICLE_BODY_IMAGE_SIZES,
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
assert.match(
  enriched,
  new RegExp(`sizes="${ARTICLE_BODY_IMAGE_SIZES.replace(/[()]/g, "\\$&")}"`),
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
