"use server";

import { revalidatePath } from "next/cache";

import {
  auditAndRepairImageAssets,
  convertExistingUploadsToWebp,
  deleteImageAsset,
  getImageAssetList,
  importExistingUploads,
  rebuildImageReferences,
  rebuildResponsiveImageVariants,
  replaceImageAssetFile,
  replaceImageReferences,
  renameImageAssetFile,
  serializeImageAsset,
  updateImageAssetMetadata,
} from "@/server/images/assets";
import { requireAdminSession } from "@fwqgo/auth/session";
import { revalidateSiteContent, cacheTags } from "@fwqgo/cache/tags";

function revalidateImageWorkbenches() {
  revalidatePath("/images/list");
  revalidatePath("/images/upload");
  revalidatePath("/images/ai-generate");
  revalidatePath("/images/covers");
}

export async function getImageAssets() {
  await requireAdminSession();
  const images = await getImageAssetList();
  return { data: images.map(serializeImageAsset) };
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
  return { data };
}

export async function auditAndRepairImageAssetsAction() {
  await requireAdminSession();
  const data = await auditAndRepairImageAssets();
  revalidateImageWorkbenches();
  revalidateSiteContent([cacheTags.posts, cacheTags.homepage]);
  return { data };
}

export async function convertUploadImagesToWebpAction() {
  await requireAdminSession();
  const data = await convertExistingUploadsToWebp();
  revalidateImageWorkbenches();
  revalidateSiteContent([cacheTags.posts, cacheTags.homepage]);
  return { data };
}

export async function deleteImageAssetAction(id: number) {
  await requireAdminSession();
  const result = await deleteImageAsset(id);
  revalidateImageWorkbenches();
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
  return result;
}
