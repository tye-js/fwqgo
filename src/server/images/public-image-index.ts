import { cacheLife } from "next/cache";

import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { isDatabaseFreeBuild } from "@fwqgo/core/build-verification";
import { readDb } from "@fwqgo/db";
import { imageAssets } from "@fwqgo/db/schema";

/** 站内上传图片的真实像素尺寸：`/uploads/<文件名>` → 宽高。 */
export type UploadImageDimensions = Readonly<
  Record<string, { width: number; height: number }>
>;

/**
 * 全站共用的「上传图片 → 真实宽高」索引。
 *
 * 正文图片的 `width`/`height` 来自这里。净化器拿不到尺寸时会写入 1200x675 的
 * 16:9 兜底并打上 `data-article-image-dimensions="fallback"`，样式表据此把图片
 * 框成 16:9 灰底信箱；只有注入真实尺寸，竖图与长截图才能按原比例排版，同时
 * 保留宽高比占位、不产生 CLS。
 *
 * 只缓存这张小表（当前约 200 行）而不是按正文内容反查用到了哪几张图：
 * 一次查询全站复用，省掉每次渲染都要扫描正文的成本。行数继续增长到几万条时
 * 需要改回按引用反查（`imageAssetReferences` 已经维护了 post → image 的映射）。
 *
 * `image.changed` 事件会更新 posts 与 knowledge 标签（见 `packages/cache/tags.ts`），
 * 本索引随之失效——替换图片后前台不会继续按旧宽高排版。
 */
export async function getUploadImageDimensions(): Promise<UploadImageDimensions> {
  "use cache";
  cacheLife({ stale: 3600, revalidate: 86_400, expire: 604_800 });
  tagCache(cacheTags.posts, cacheTags.knowledge);

  if (isDatabaseFreeBuild()) return {};

  const rows = await readDb
    .select({
      path: imageAssets.path,
      width: imageAssets.width,
      height: imageAssets.height,
    })
    .from(imageAssets);

  const dimensions: Record<string, { width: number; height: number }> = {};

  for (const row of rows) {
    // 宽高是可空列：没有尺寸的图片继续走 16:9 兜底，不写入索引。
    if (!row.width || !row.height || row.width <= 0 || row.height <= 0) continue;
    dimensions[row.path] = { width: row.width, height: row.height };
  }

  return dimensions;
}
