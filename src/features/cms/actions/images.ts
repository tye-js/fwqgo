"use server";

import { revalidatePath } from "next/cache";
import { desc, or } from "drizzle-orm";

import {
  auditAndRepairImageAssets,
  convertExistingUploadsToWebp,
  deleteImageAsset,
  importExistingUploads,
  rebuildImageReferences,
  rebuildResponsiveImageVariants,
  replaceImageAssetFile,
  replaceImageReferences,
  renameImageAssetFile,
  updateImageAssetMetadata,
} from "@/server/images/assets";
import { requireAdminSession } from "@fwqgo/auth/session";
import { db } from "@fwqgo/db";
import { imageAssets } from "@fwqgo/db/schema";
import { revalidateSiteContent, cacheTags } from "@fwqgo/cache/tags";
import { ilikeContains } from "@/server/db/search";
import { notifyPublicWebCache } from "@/server/cache/public-revalidation-client";

function revalidateImageWorkbenches() {
  revalidatePath("/images/list");
  revalidatePath("/images/upload");
  revalidatePath("/images/ai-generate");
  revalidatePath("/images/covers");
}

export async function getImageAssetPickerOptions(query = "") {
  await requireAdminSession();
  const normalizedQuery = query.trim().slice(0, 160);
  const searchCondition = normalizedQuery
    ? or(
        ilikeContains(imageAssets.path, normalizedQuery),
        ilikeContains(imageAssets.originalName, normalizedQuery),
      )
    : undefined;
  const images = await db
    .select({
      id: imageAssets.id,
      path: imageAssets.path,
      thumbPath: imageAssets.thumbPath,
      originalName: imageAssets.originalName,
    })
    .from(imageAssets)
    .where(searchCondition)
    .orderBy(desc(imageAssets.createdAt))
    .limit(80);

  return { data: images };
}

export async function importUploadImagesAction() {
  await requireAdminSession();
  const data = await importExistingUploads();
  revalidateImageWorkbenches();
  return { data };
}

export async function rebuildImageReferencesAction() {
  await requireAdminSession();
  const data = await rebuildImageReferences();
  revalidateImageWorkbenches();
  return { data };
}

export async function rebuildResponsiveImageVariantsAction() {
  await requireAdminSession();
  const data = await rebuildResponsiveImageVariants();
  revalidateImageWorkbenches();
  revalidateSiteContent([cacheTags.posts, cacheTags.homepage]);
  await notifyPublicWebCache("image.changed");
  return { data };
}

export async function auditAndRepairImageAssetsAction() {
  await requireAdminSession();
  const data = await auditAndRepairImageAssets();
  revalidateImageWorkbenches();
  revalidateSiteContent([cacheTags.posts, cacheTags.homepage]);
  await notifyPublicWebCache("image.changed");
  return { data };
}

export async function convertUploadImagesToWebpAction() {
  await requireAdminSession();
  const data = await convertExistingUploadsToWebp();
  revalidateImageWorkbenches();
  revalidateSiteContent([cacheTags.posts, cacheTags.homepage]);
  await notifyPublicWebCache("image.changed");
  return { data };
}

export async function deleteImageAssetAction(id: number) {
  await requireAdminSession();
  const result = await deleteImageAsset(id);
  revalidateImageWorkbenches();
  await notifyPublicWebCache("image.changed");
  return result;
}

export async function replaceImageAssetFileAction(formData: FormData) {
  await requireAdminSession();
  const id = Number(formData.get("id"));
  const file = formData.get("file");

  if (!Number.isFinite(id) || !(file instanceof File)) {
    return { error: "参数无效" };
  }

  const data = await replaceImageAssetFile({ id, file });
  revalidateImageWorkbenches();
  revalidateSiteContent([cacheTags.posts, cacheTags.homepage]);
  await notifyPublicWebCache("image.changed");
  return {
    data: {
      ...data,
      createdAt: data.createdAt.toISOString(),
      updatedAt: data.updatedAt?.toISOString() ?? null,
    },
  };
}

export async function replaceImageReferencesAction(input: {
  imageId: number;
  replacementPath: string;
}) {
  await requireAdminSession();
  const result = await replaceImageReferences(input);
  revalidateImageWorkbenches();
  revalidateSiteContent([cacheTags.posts, cacheTags.homepage]);
  await notifyPublicWebCache("image.changed");
  return result;
}

export async function renameImageAssetFileAction(input: {
  id: number;
  fileName: string;
}) {
  await requireAdminSession();
  const result = await renameImageAssetFile(input);
  revalidateImageWorkbenches();
  revalidateSiteContent([cacheTags.posts, cacheTags.homepage]);
  await notifyPublicWebCache("image.changed");
  return result;
}

export async function updateImageAssetMetadataAction(input: {
  id: number;
  imageType?: string | null;
  status?: string | null;
  altZh?: string | null;
  altEn?: string | null;
  sourceUrl?: string | null;
  prompt?: string | null;
}) {
  await requireAdminSession();
  const result = await updateImageAssetMetadata(input);
  revalidateImageWorkbenches();
  await notifyPublicWebCache("image.changed");
  return result;
}
