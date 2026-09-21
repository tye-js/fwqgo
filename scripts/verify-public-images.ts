import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { getOptimizedImageSrc } from "../packages/core/image-src";

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

console.log(
  "Public image optimizer verified: uploads route through /api/images/source, webp/avif enabled, no public component opts out.",
);
