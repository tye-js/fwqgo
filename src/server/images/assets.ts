import crypto from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@fwqgo/db";
import {
  imageAssetReferences,
  imageAssets,
  posts,
  users,
} from "@fwqgo/db/schema";
import { withAsyncRollback } from "@fwqgo/core/async-rollback";
import { sanitizeFileName } from "@fwqgo/core/utils";

export const UPLOAD_PUBLIC_PREFIX = "/uploads/";
const MAX_UPLOAD_SIZE = 8 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

export type ImageAssetRow = typeof imageAssets.$inferSelect;
export type ImageAssetListItem = Awaited<
  ReturnType<typeof getImageAssetList>
>[number];

type ImageReference = {
  imageId: number;
  sourceType: string;
  sourceId: string;
  sourceLabel: string | null;
  field: string;
};

type ImageAssetLookup = Pick<ImageAssetRow, "id" | "path">;

async function loadSharp() {
  try {
    const sharpModule = await import("sharp");
    return sharpModule.default;
  } catch (error) {
    console.warn("Sharp is unavailable.", error);
    return null;
  }
}

export function getUploadDir() {
  return process.env.UPLOAD_DIR ?? path.join("/var/www", "uploads");
}

function stripUploadUrlNoise(value: string) {
  let normalized = value.trim();

  try {
    const parsed = new URL(normalized, "https://fwqgo.local");
    normalized = parsed.pathname;
  } catch {
    normalized = normalized.split("#")[0]?.split("?")[0] ?? normalized;
  }

  return normalized.replace(/[),.;，。]+$/g, "");
}

export function toUploadPath(value: string | null | undefined) {
  if (!value) return null;

  const decodedCandidates = new Set<string>([value]);
  try {
    decodedCandidates.add(decodeURIComponent(value));
  } catch {
    // Keep the raw candidate when decoding fails.
  }

  for (const candidate of decodedCandidates) {
    const cleaned = stripUploadUrlNoise(candidate);
    const uploadIndex = cleaned.indexOf(UPLOAD_PUBLIC_PREFIX);
    if (uploadIndex === -1) continue;

    try {
      return normalizeUploadPath(cleaned.slice(uploadIndex));
    } catch {
      continue;
    }
  }

  return null;
}

export function normalizeUploadPath(value: string) {
  const cleaned = stripUploadUrlNoise(value);

  if (!cleaned.startsWith(UPLOAD_PUBLIC_PREFIX)) {
    throw new Error("Invalid upload path");
  }

  let decoded = cleaned;
  try {
    decoded = decodeURIComponent(cleaned);
  } catch {
    decoded = cleaned;
  }

  const decodedFileName = path.basename(decoded);
  if (!decodedFileName || decodedFileName === "." || decodedFileName === "..") {
    throw new Error("Invalid upload path");
  }

  return `${UPLOAD_PUBLIC_PREFIX}${path.basename(cleaned)}`;
}

export function uploadPathToFilePath(publicPath: string) {
  const normalized = normalizeUploadPath(publicPath);
  return path.join(getUploadDir(), path.basename(normalized));
}

function hashBuffer(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function inferMimeFromExtension(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function buildOutputName(originalName: string, mime: string) {
  const sanitizedName = sanitizeFileName(originalName);
  const ext = mime === "image/gif" ? ".gif" : ".webp";
  const base = path.basename(sanitizedName, path.extname(sanitizedName));
  return `${Date.now()}-${base}${ext}`;
}

function fallbackImageAlt(originalName: string) {
  const base = path
    .basename(originalName, path.extname(originalName))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return base || "server deal image";
}

function buildVariantName(publicPath: string, variant: "thumb" | "large") {
  const parsed = path.parse(path.basename(publicPath));
  return `${parsed.name}_${variant}.webp`;
}

function isGeneratedVariantFileName(fileName: string) {
  const parsed = path.parse(fileName);
  return /_(thumb|large)$/i.test(parsed.name);
}

async function getAvailablePublicPath(fileName: string) {
  const uploadDir = getUploadDir();
  const parsed = path.parse(fileName);
  let candidate = fileName;
  let counter = 1;

  while (existsSync(path.join(uploadDir, candidate))) {
    candidate = `${parsed.name}-${counter}${parsed.ext}`;
    counter += 1;
  }

  return `${UPLOAD_PUBLIC_PREFIX}${candidate}`;
}

function buildRenamedPublicPath(input: {
  currentPath: string;
  nextName: string;
}) {
  const current = path.parse(
    path.basename(normalizeUploadPath(input.currentPath)),
  );
  const sanitized = sanitizeFileName(input.nextName.trim());
  const parsed = path.parse(path.basename(sanitized));
  const baseName = (parsed.name || current.name).trim();
  const ext = (parsed.ext || current.ext).toLowerCase();

  if (!baseName || baseName === "." || baseName === "..") {
    throw new Error("图片名称不能为空");
  }

  if (!IMAGE_EXTENSIONS.has(ext)) {
    throw new Error("图片名称只支持 jpg、jpeg、png、gif、webp 后缀");
  }

  if (ext !== current.ext.toLowerCase()) {
    throw new Error("只能修改文件名，不能通过重命名修改图片格式");
  }

  return `${UPLOAD_PUBLIC_PREFIX}${baseName}${ext}`;
}

async function optimizeUpload(buffer: Buffer, mime: string) {
  if (mime === "image/gif") {
    return { buffer, mime };
  }

  const sharp = await loadSharp();
  if (!sharp) {
    throw new Error(
      "图片转 WebP 需要 sharp，请先确认服务器构建产物包含 sharp。",
    );
  }

  const optimized = await sharp(buffer)
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  return { buffer: optimized, mime: "image/webp" };
}

async function optimizeReplacementUpload(input: {
  buffer: Buffer;
  sourceMime: string;
  targetPath: string;
}) {
  const targetExt = path.extname(input.targetPath).toLowerCase();
  const sourceIsGif = input.sourceMime === "image/gif";
  const targetIsGif = targetExt === ".gif";

  if (sourceIsGif !== targetIsGif) {
    throw new Error(
      "GIF 与静态图片不能互相替换，否则原图片 URL 会与文件格式不一致",
    );
  }
  if (targetIsGif) {
    return { buffer: input.buffer, mime: "image/gif" };
  }

  const sharp = await loadSharp();
  if (!sharp) {
    throw new Error("替换图片需要 sharp，请先确认服务器构建产物包含 sharp。");
  }

  const pipeline = sharp(input.buffer).rotate().resize({
    width: 1600,
    height: 1600,
    fit: "inside",
    withoutEnlargement: true,
  });

  if (targetExt === ".jpg" || targetExt === ".jpeg") {
    return {
      buffer: await pipeline.jpeg({ quality: 84, mozjpeg: true }).toBuffer(),
      mime: "image/jpeg",
    };
  }
  if (targetExt === ".png") {
    return {
      buffer: await pipeline.png({ compressionLevel: 9 }).toBuffer(),
      mime: "image/png",
    };
  }
  if (targetExt === ".webp") {
    return {
      buffer: await pipeline.webp({ quality: 82, effort: 4 }).toBuffer(),
      mime: "image/webp",
    };
  }

  throw new Error("当前图片 URL 的文件格式不支持原路径替换");
}

async function createResponsiveVariants(input: {
  buffer: Buffer;
  mime: string;
  publicPath: string;
}) {
  if (input.mime === "image/gif") {
    return { thumbPath: null, largePath: null };
  }

  const sharp = await loadSharp();
  if (!sharp) {
    throw new Error(
      "生成响应式图片需要 sharp，请先确认服务器构建产物包含 sharp。",
    );
  }

  const [thumbPath, largePath] = await Promise.all([
    getAvailablePublicPath(buildVariantName(input.publicPath, "thumb")),
    getAvailablePublicPath(buildVariantName(input.publicPath, "large")),
  ]);

  const [thumbBuffer, largeBuffer] = await Promise.all([
    sharp(input.buffer)
      .resize({
        width: 400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 78, effort: 4 })
      .toBuffer(),
    sharp(input.buffer)
      .resize({
        width: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer(),
  ]);

  const variantPaths = [thumbPath, largePath] as const;
  const results = await Promise.allSettled([
    writeFile(uploadPathToFilePath(thumbPath), thumbBuffer),
    writeFile(uploadPathToFilePath(largePath), largeBuffer),
  ]);
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (failed) {
    await Promise.allSettled(
      results.flatMap((result, index) =>
        result.status === "fulfilled"
          ? [removeCreatedUploadFile(variantPaths[index]!)]
          : [],
      ),
    );
    throw failed.reason;
  }

  return { thumbPath, largePath };
}

async function removeCreatedUploadFile(publicPath: string) {
  try {
    await unlink(uploadPathToFilePath(publicPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function removeVariantFiles(asset: {
  thumbPath: string | null;
  largePath: string | null;
}) {
  for (const publicPath of [asset.thumbPath, asset.largePath]) {
    if (!publicPath) continue;
    const filePath = uploadPathToFilePath(publicPath);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  }
}

async function getDimensions(buffer: Buffer) {
  const sharp = await loadSharp();
  if (!sharp) {
    return { width: null, height: null };
  }

  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}

async function getDimensionsFromFile(filePath: string) {
  const sharp = await loadSharp();
  if (!sharp) {
    return { width: null, height: null };
  }

  const metadata = await sharp(filePath).metadata();
  return {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}

type OptimizedImageAssetInput = {
  buffer: Buffer;
  mime: string;
  originalName: string;
  uploadedBy: string | null;
  altZh?: string | null;
  altEn?: string | null;
  imageType?: string | null;
  sourceUrl?: string | null;
  prompt?: string | null;
};

async function persistOptimizedImageAsset(input: OptimizedImageAssetInput) {
  const hash = hashBuffer(input.buffer);
  const [existing] = await db
    .select()
    .from(imageAssets)
    .where(eq(imageAssets.hash, hash))
    .limit(1);

  if (existing) {
    return existing;
  }

  const fileName = buildOutputName(input.originalName, input.mime);
  const publicPath = await getAvailablePublicPath(fileName);
  const filePath = uploadPathToFilePath(publicPath);
  const dimensions = await getDimensions(input.buffer);

  return withAsyncRollback(async (defer) => {
    await mkdir(getUploadDir(), { recursive: true });
    await writeFile(filePath, input.buffer);
    defer(() => removeCreatedUploadFile(publicPath));

    const variants = await createResponsiveVariants({
      buffer: input.buffer,
      mime: input.mime,
      publicPath,
    });
    for (const variantPath of [variants.thumbPath, variants.largePath]) {
      if (variantPath) {
        defer(() => removeCreatedUploadFile(variantPath));
      }
    }

    const [asset] = await db
      .insert(imageAssets)
      .values({
        path: publicPath,
        thumbPath: variants.thumbPath,
        largePath: variants.largePath,
        originalName: input.originalName,
        mime: input.mime,
        size: input.buffer.length,
        width: dimensions.width,
        height: dimensions.height,
        hash,
        imageType: input.imageType ?? "upload",
        altZh: input.altZh ?? fallbackImageAlt(input.originalName),
        altEn: input.altEn ?? fallbackImageAlt(input.originalName),
        sourceUrl: input.sourceUrl ?? null,
        prompt: input.prompt ?? null,
        uploadedBy: input.uploadedBy,
      })
      .returning();

    if (!asset) {
      throw new Error("Image asset insert returned no row");
    }

    return asset;
  });
}

export async function createImageAssetFromUpload(input: {
  file: File;
  uploadedBy: string | null;
  altZh?: string | null;
  altEn?: string | null;
  imageType?: string | null;
  sourceUrl?: string | null;
  prompt?: string | null;
}) {
  if (!ALLOWED_UPLOAD_TYPES.has(input.file.type)) {
    throw new Error("Invalid file type");
  }

  if (input.file.size > MAX_UPLOAD_SIZE) {
    throw new Error("Image is too large");
  }

  const originalBuffer = Buffer.from(await input.file.arrayBuffer());
  const optimized = await optimizeUpload(originalBuffer, input.file.type);
  return persistOptimizedImageAsset({
    buffer: optimized.buffer,
    mime: optimized.mime,
    originalName: input.file.name,
    uploadedBy: input.uploadedBy,
    altZh: input.altZh,
    altEn: input.altEn,
    imageType: input.imageType,
    sourceUrl: input.sourceUrl,
    prompt: input.prompt,
  });
}

export async function createImageAssetFromBuffer(input: {
  buffer: Buffer;
  mime: string;
  originalName: string;
  uploadedBy: string | null;
  altZh?: string | null;
  altEn?: string | null;
  imageType?: string | null;
  sourceUrl?: string | null;
  prompt?: string | null;
}) {
  if (!ALLOWED_UPLOAD_TYPES.has(input.mime)) {
    throw new Error("Invalid file type");
  }

  if (input.buffer.length > MAX_UPLOAD_SIZE) {
    throw new Error("Image is too large");
  }

  const optimized = await optimizeUpload(input.buffer, input.mime);
  return persistOptimizedImageAsset({
    buffer: optimized.buffer,
    mime: optimized.mime,
    originalName: input.originalName,
    uploadedBy: input.uploadedBy,
    altZh: input.altZh,
    altEn: input.altEn,
    imageType: input.imageType,
    sourceUrl: input.sourceUrl,
    prompt: input.prompt,
  });
}

export async function replaceImageAssetFile(input: { id: number; file: File }) {
  if (!ALLOWED_UPLOAD_TYPES.has(input.file.type)) {
    throw new Error("Invalid file type");
  }

  if (input.file.size > MAX_UPLOAD_SIZE) {
    throw new Error("Image is too large");
  }

  const [asset] = await db
    .select()
    .from(imageAssets)
    .where(eq(imageAssets.id, input.id))
    .limit(1);

  if (!asset) {
    throw new Error("Image asset not found");
  }

  const originalBuffer = Buffer.from(await input.file.arrayBuffer());
  const optimized = await optimizeReplacementUpload({
    buffer: originalBuffer,
    sourceMime: input.file.type,
    targetPath: asset.path,
  });
  const dimensions = await getDimensions(optimized.buffer);
  const filePath = uploadPathToFilePath(asset.path);

  await mkdir(getUploadDir(), { recursive: true });
  await writeFile(filePath, optimized.buffer);
  await removeVariantFiles(asset);
  const variants = await createResponsiveVariants({
    buffer: optimized.buffer,
    mime: optimized.mime,
    publicPath: asset.path,
  });

  const [updated] = await db
    .update(imageAssets)
    .set({
      thumbPath: variants.thumbPath,
      largePath: variants.largePath,
      originalName: input.file.name,
      mime: optimized.mime,
      size: optimized.buffer.length,
      width: dimensions.width,
      height: dimensions.height,
      hash: hashBuffer(optimized.buffer),
      updatedAt: new Date(),
    })
    .where(eq(imageAssets.id, asset.id))
    .returning();

  return updated!;
}

export async function updateImageAssetMetadata(input: {
  id: number;
  imageType?: string | null;
  status?: string | null;
  altZh?: string | null;
  altEn?: string | null;
  sourceUrl?: string | null;
  prompt?: string | null;
}) {
  const normalizeText = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  };

  const [asset] = await db
    .update(imageAssets)
    .set({
      imageType: normalizeText(input.imageType) ?? "upload",
      status: normalizeText(input.status) ?? "active",
      altZh: normalizeText(input.altZh),
      altEn: normalizeText(input.altEn),
      sourceUrl: normalizeText(input.sourceUrl),
      prompt: normalizeText(input.prompt),
      updatedAt: new Date(),
    })
    .where(eq(imageAssets.id, input.id))
    .returning();

  if (!asset) {
    return { error: "图片不存在" };
  }

  return { data: asset };
}

async function renameUploadFileIfPresent(input: {
  fromPath: string | null;
  toPath: string | null;
}) {
  if (!input.fromPath || !input.toPath || input.fromPath === input.toPath) {
    return;
  }

  const fromFile = uploadPathToFilePath(input.fromPath);
  const toFile = uploadPathToFilePath(input.toPath);

  if (!existsSync(fromFile)) {
    throw new Error(`服务器文件不存在：${input.fromPath}`);
  }

  if (existsSync(toFile)) {
    throw new Error(`目标文件已存在：${input.toPath}`);
  }

  await rename(fromFile, toFile);
}

export async function renameImageAssetFile(input: {
  id: number;
  fileName: string;
}) {
  const [asset] = await db
    .select()
    .from(imageAssets)
    .where(eq(imageAssets.id, input.id))
    .limit(1);

  if (!asset) {
    return { error: "图片不存在" };
  }

  let nextPath: string;
  try {
    nextPath = buildRenamedPublicPath({
      currentPath: asset.path,
      nextName: input.fileName,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "图片名称无效" };
  }

  if (nextPath === asset.path) {
    return { data: asset };
  }

  const [existing] = await db
    .select({ id: imageAssets.id })
    .from(imageAssets)
    .where(eq(imageAssets.path, nextPath))
    .limit(1);

  if (existing) {
    return { error: "目标图片名称已存在，请换一个名称" };
  }

  const nextThumbPath = asset.thumbPath
    ? `${UPLOAD_PUBLIC_PREFIX}${buildVariantName(nextPath, "thumb")}`
    : null;
  const nextLargePath = asset.largePath
    ? `${UPLOAD_PUBLIC_PREFIX}${buildVariantName(nextPath, "large")}`
    : null;

  const renamedFiles: Array<{
    fromPath: string | null;
    toPath: string | null;
  }> = [];

  try {
    await renameUploadFileIfPresent({ fromPath: asset.path, toPath: nextPath });
    renamedFiles.push({ fromPath: nextPath, toPath: asset.path });
    await renameUploadFileIfPresent({
      fromPath: asset.thumbPath,
      toPath: nextThumbPath,
    });
    renamedFiles.push({ fromPath: nextThumbPath, toPath: asset.thumbPath });
    await renameUploadFileIfPresent({
      fromPath: asset.largePath,
      toPath: nextLargePath,
    });
    renamedFiles.push({ fromPath: nextLargePath, toPath: asset.largePath });

    const [updated] = await db.transaction(async (tx) => {
      const [updatedAsset] = await tx
        .update(imageAssets)
        .set({
          path: nextPath,
          thumbPath: nextThumbPath,
          largePath: nextLargePath,
          originalName: path.basename(nextPath),
          updatedAt: new Date(),
        })
        .where(eq(imageAssets.id, asset.id))
        .returning();

      const siteBaseUrl = (
        process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com"
      ).replace(/\/+$/, "");
      const absoluteAssetPath = `${siteBaseUrl}${asset.path}`;
      const absoluteNextPath = `${siteBaseUrl}${nextPath}`;

      await tx
        .update(posts)
        .set({
          imgUrl: sql`replace(replace(${posts.imgUrl}, ${absoluteAssetPath}, ${absoluteNextPath}), ${asset.path}, ${nextPath})`,
          enImgUrl: sql`replace(replace(${posts.enImgUrl}, ${absoluteAssetPath}, ${absoluteNextPath}), ${asset.path}, ${nextPath})`,
          updatedAt: new Date(),
        })
        .where(
          sql`${posts.imgUrl} like ${`%${asset.path}%`} or ${posts.imgUrl} like ${`%${absoluteAssetPath}%`} or ${posts.enImgUrl} like ${`%${asset.path}%`} or ${posts.enImgUrl} like ${`%${absoluteAssetPath}%`}`,
        );

      await tx
        .update(posts)
        .set({
          content: sql`replace(replace(${posts.content}, ${absoluteAssetPath}, ${absoluteNextPath}), ${asset.path}, ${nextPath})`,
          enContent: sql`replace(replace(${posts.enContent}, ${absoluteAssetPath}, ${absoluteNextPath}), ${asset.path}, ${nextPath})`,
          updatedAt: new Date(),
        })
        .where(
          sql`${posts.content} like ${`%${asset.path}%`} or ${posts.content} like ${`%${absoluteAssetPath}%`} or ${posts.enContent} like ${`%${asset.path}%`} or ${posts.enContent} like ${`%${absoluteAssetPath}%`}`,
        );

      await tx
        .update(users)
        .set({
          image: sql`replace(replace(${users.image}, ${absoluteAssetPath}, ${absoluteNextPath}), ${asset.path}, ${nextPath})`,
          updatedAt: new Date(),
        })
        .where(
          sql`${users.image} like ${`%${asset.path}%`} or ${users.image} like ${`%${absoluteAssetPath}%`}`,
        );

      return [updatedAsset];
    });
    await rebuildImageReferences();

    return { data: updated! };
  } catch (error) {
    for (const file of renamedFiles.reverse()) {
      try {
        await renameUploadFileIfPresent(file);
      } catch {
        // Best-effort rollback only. Return the original failure below.
      }
    }

    return {
      error: error instanceof Error ? error.message : "图片重命名失败",
    };
  }
}

export async function convertExistingUploadsToWebp() {
  const sharp = await loadSharp();
  if (!sharp) {
    throw new Error(
      "图片转 WebP 需要 sharp，请先确认服务器构建产物包含 sharp。",
    );
  }

  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });

  const assets = await db
    .select()
    .from(imageAssets)
    .orderBy(sql`${imageAssets.createdAt} desc`);
  let converted = 0;
  let skipped = 0;
  const failed: Array<{ path: string; error: string }> = [];

  for (const asset of assets) {
    const currentPath = toUploadPath(asset.path);
    if (!currentPath) {
      skipped += 1;
      continue;
    }

    const ext = path.extname(currentPath).toLowerCase();
    if (ext === ".webp" || ext === ".gif") {
      skipped += 1;
      continue;
    }

    if (!IMAGE_EXTENSIONS.has(ext)) {
      skipped += 1;
      continue;
    }

    try {
      const currentFilePath = uploadPathToFilePath(currentPath);
      if (!existsSync(currentFilePath)) {
        failed.push({ path: currentPath, error: "服务器文件不存在" });
        continue;
      }

      const parsed = path.parse(path.basename(currentPath));
      const nextPublicPath = await getAvailablePublicPath(
        `${parsed.name}.webp`,
      );
      const nextFilePath = uploadPathToFilePath(nextPublicPath);
      const optimized = await sharp(currentFilePath)
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();
      const dimensions = await getDimensions(optimized);

      await writeFile(nextFilePath, optimized);
      await removeVariantFiles(asset);
      const variants = await createResponsiveVariants({
        buffer: optimized,
        mime: "image/webp",
        publicPath: nextPublicPath,
      });

      await db.transaction(async (tx) => {
        await tx
          .update(imageAssets)
          .set({
            path: nextPublicPath,
            thumbPath: variants.thumbPath,
            largePath: variants.largePath,
            mime: "image/webp",
            size: optimized.length,
            width: dimensions.width,
            height: dimensions.height,
            hash: hashBuffer(optimized),
            updatedAt: new Date(),
          })
          .where(eq(imageAssets.id, asset.id));

        await tx
          .update(posts)
          .set({
            imgUrl: sql`replace(${posts.imgUrl}, ${currentPath}, ${nextPublicPath})`,
            updatedAt: new Date(),
          })
          .where(sql`${posts.imgUrl} like ${`%${currentPath}%`}`);

        await tx
          .update(posts)
          .set({
            content: sql`replace(${posts.content}, ${currentPath}, ${nextPublicPath})`,
            updatedAt: new Date(),
          })
          .where(sql`${posts.content} like ${`%${currentPath}%`}`);

        await tx
          .update(users)
          .set({
            image: sql`replace(${users.image}, ${currentPath}, ${nextPublicPath})`,
            updatedAt: new Date(),
          })
          .where(sql`${users.image} like ${`%${currentPath}%`}`);
      });

      await unlink(currentFilePath);
      converted += 1;
    } catch (error) {
      failed.push({
        path: currentPath,
        error: error instanceof Error ? error.message : "转换失败",
      });
    }
  }

  const rebuilt = await rebuildImageReferences();
  return { converted, skipped, failed, references: rebuilt.references };
}

export async function rebuildResponsiveImageVariants() {
  const assets = await db
    .select()
    .from(imageAssets)
    .orderBy(sql`${imageAssets.createdAt} desc`);
  let rebuilt = 0;
  let skipped = 0;
  const failed: Array<{ path: string; error: string }> = [];

  for (const asset of assets) {
    if (asset.mime === "image/gif") {
      skipped += 1;
      continue;
    }

    try {
      const currentPath = toUploadPath(asset.path);
      if (!currentPath) {
        skipped += 1;
        continue;
      }

      const filePath = uploadPathToFilePath(currentPath);
      if (!existsSync(filePath)) {
        failed.push({ path: currentPath, error: "服务器文件不存在" });
        continue;
      }

      const buffer = await readFile(filePath);
      await removeVariantFiles(asset);
      const variants = await createResponsiveVariants({
        buffer,
        mime: asset.mime,
        publicPath: asset.path,
      });

      await db
        .update(imageAssets)
        .set({
          thumbPath: variants.thumbPath,
          largePath: variants.largePath,
          updatedAt: new Date(),
        })
        .where(eq(imageAssets.id, asset.id));

      rebuilt += 1;
    } catch (error) {
      failed.push({
        path: asset.path,
        error: error instanceof Error ? error.message : "重建失败",
      });
    }
  }

  return { rebuilt, skipped, failed };
}

function variantFileExists(publicPath: string | null) {
  if (!publicPath) return false;

  try {
    return existsSync(uploadPathToFilePath(publicPath));
  } catch {
    return false;
  }
}

export async function auditAndRepairImageAssets() {
  const assets = await db
    .select()
    .from(imageAssets)
    .orderBy(sql`${imageAssets.createdAt} desc`);
  let repaired = 0;
  let variantsRebuilt = 0;
  let missing = 0;
  let skipped = 0;
  const failed: Array<{ path: string; error: string }> = [];

  await mkdir(getUploadDir(), { recursive: true });

  for (const asset of assets) {
    const currentPath = toUploadPath(asset.path);
    if (!currentPath) {
      skipped += 1;
      continue;
    }

    try {
      const filePath = uploadPathToFilePath(currentPath);
      if (!existsSync(filePath)) {
        missing += 1;
        if (asset.status !== "missing") {
          await db
            .update(imageAssets)
            .set({ status: "missing", updatedAt: new Date() })
            .where(eq(imageAssets.id, asset.id));
          repaired += 1;
        }
        continue;
      }

      const [fileStat, buffer, dimensions] = await Promise.all([
        stat(filePath),
        readFile(filePath),
        getDimensionsFromFile(filePath),
      ]);
      const nextHash = hashBuffer(buffer);
      const nextMime = inferMimeFromExtension(currentPath);
      const patch: Partial<typeof imageAssets.$inferInsert> = {};

      if (asset.size !== fileStat.size) patch.size = fileStat.size;
      if (asset.hash !== nextHash) patch.hash = nextHash;
      if (asset.mime !== nextMime) patch.mime = nextMime;
      if (asset.width !== dimensions.width) patch.width = dimensions.width;
      if (asset.height !== dimensions.height) patch.height = dimensions.height;
      if (asset.status === "missing") patch.status = "active";

      const shouldRebuildVariants =
        nextMime !== "image/gif" &&
        (!asset.thumbPath ||
          !asset.largePath ||
          !variantFileExists(asset.thumbPath) ||
          !variantFileExists(asset.largePath));

      if (shouldRebuildVariants) {
        await removeVariantFiles(asset);
        const variants = await createResponsiveVariants({
          buffer,
          mime: nextMime,
          publicPath: currentPath,
        });
        patch.thumbPath = variants.thumbPath;
        patch.largePath = variants.largePath;
        variantsRebuilt += 1;
      }

      if (Object.keys(patch).length > 0) {
        await db
          .update(imageAssets)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(imageAssets.id, asset.id));
        repaired += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      failed.push({
        path: currentPath,
        error: error instanceof Error ? error.message : "图片资产体检失败",
      });
    }
  }

  const rebuilt = await rebuildImageReferences();

  return {
    scanned: assets.length,
    repaired,
    variantsRebuilt,
    missing,
    skipped,
    failed,
    references: rebuilt.references,
  };
}

export async function importExistingUploads() {
  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });

  const files = await readdir(uploadDir, { withFileTypes: true });
  let imported = 0;
  let skipped = 0;

  for (const entry of files) {
    if (!entry.isFile()) {
      skipped += 1;
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext) || isGeneratedVariantFileName(entry.name)) {
      skipped += 1;
      continue;
    }

    const publicPath = `${UPLOAD_PUBLIC_PREFIX}${entry.name}`;
    const [existing] = await db
      .select({ id: imageAssets.id })
      .from(imageAssets)
      .where(eq(imageAssets.path, publicPath))
      .limit(1);

    if (existing) {
      skipped += 1;
      continue;
    }

    const filePath = path.join(uploadDir, entry.name);
    const [fileStat, buffer, dimensions] = await Promise.all([
      stat(filePath),
      readFile(filePath),
      getDimensionsFromFile(filePath),
    ]);
    const mime = inferMimeFromExtension(entry.name);
    const variants = await createResponsiveVariants({
      buffer,
      mime,
      publicPath,
    });

    await db.insert(imageAssets).values({
      path: publicPath,
      thumbPath: variants.thumbPath,
      largePath: variants.largePath,
      originalName: entry.name.replace(/^\d+-/, ""),
      mime,
      size: fileStat.size,
      width: dimensions.width,
      height: dimensions.height,
      hash: hashBuffer(buffer),
      uploadedBy: null,
      createdAt: fileStat.mtime,
    });

    imported += 1;
  }

  await rebuildImageReferences();

  return { imported, skipped };
}

export async function getImageAssetList() {
  const assets = await db
    .select()
    .from(imageAssets)
    .orderBy(sql`${imageAssets.createdAt} desc`);

  const references =
    assets.length === 0
      ? []
      : await db
          .select()
          .from(imageAssetReferences)
          .where(
            inArray(
              imageAssetReferences.imageId,
              assets.map((asset) => asset.id),
            ),
          );

  const referencesByImageId = new Map<number, typeof references>();
  for (const reference of references) {
    const current = referencesByImageId.get(reference.imageId) ?? [];
    current.push(reference);
    referencesByImageId.set(reference.imageId, current);
  }

  return assets.map((asset) => ({
    ...asset,
    references: referencesByImageId.get(asset.id) ?? [],
  }));
}

export function serializeImageAsset(asset: ImageAssetListItem) {
  return {
    ...asset,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt?.toISOString() ?? null,
    references: asset.references.map((reference) => ({
      ...reference,
      createdAt: reference.createdAt.toISOString(),
      updatedAt: reference.updatedAt?.toISOString() ?? null,
    })),
  };
}

function extractUploadPathsFromHtml(html: string | null) {
  if (!html) return [];

  const paths = new Set<string>();
  const uploadMatches =
    html.match(/(?:https?:\/\/[^"'()<>\s]+)?\/uploads\/[^"'()<>\s]+/g) ?? [];
  const encodedMatches = html.match(/(?:path|src|url)=([^"'&<>\s]+)/g) ?? [];

  for (const item of [...uploadMatches, ...encodedMatches]) {
    const candidate = item.includes("=")
      ? item.split("=").slice(1).join("=")
      : item;
    const uploadPath = toUploadPath(candidate);
    if (uploadPath) {
      paths.add(uploadPath);
    }
  }

  return [...paths];
}

function createAssetFinder(assets: ImageAssetLookup[]) {
  const imageByPath = new Map(assets.map((asset) => [asset.path, asset]));
  const imageByLowerPath = new Map(
    assets.map((asset) => [asset.path.toLowerCase(), asset]),
  );

  return (value: string | null | undefined) => {
    const uploadPath = toUploadPath(value);
    if (!uploadPath) return null;
    return (
      imageByPath.get(uploadPath) ??
      imageByLowerPath.get(uploadPath.toLowerCase()) ??
      null
    );
  };
}

function buildPostImageReferences(
  post: {
    id: number;
    title: string;
    imgUrl: string | null;
    content: string;
    enImgUrl?: string | null;
    enContent?: string | null;
  },
  assets: ImageAssetLookup[],
) {
  const references: ImageReference[] = [];
  const findAsset = createAssetFinder(assets);

  const coverAsset = findAsset(post.imgUrl);
  if (coverAsset) {
    references.push({
      imageId: coverAsset.id,
      sourceType: "post",
      sourceId: String(post.id),
      sourceLabel: post.title,
      field: "cover",
    });
  }

  const englishCoverAsset = findAsset(post.enImgUrl);
  if (englishCoverAsset) {
    references.push({
      imageId: englishCoverAsset.id,
      sourceType: "post",
      sourceId: String(post.id),
      sourceLabel: post.title,
      field: "enCover",
    });
  }

  for (const uploadPath of extractUploadPathsFromHtml(post.content)) {
    const asset = findAsset(uploadPath);
    if (asset) {
      references.push({
        imageId: asset.id,
        sourceType: "post",
        sourceId: String(post.id),
        sourceLabel: post.title,
        field: "content",
      });
    }
  }

  if (post.enContent) {
    for (const uploadPath of extractUploadPathsFromHtml(post.enContent)) {
      const asset = findAsset(uploadPath);
      if (asset) {
        references.push({
          imageId: asset.id,
          sourceType: "post",
          sourceId: String(post.id),
          sourceLabel: post.title,
          field: "enContent",
        });
      }
    }
  }

  return references;
}

function dedupeImageReferences(references: ImageReference[]) {
  const seen = new Set<string>();

  return references.filter((reference) => {
    const key = [
      reference.imageId,
      reference.sourceType,
      reference.sourceId,
      reference.field,
    ].join(":");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function syncImageReferencesForPost(postId: number) {
  const sourceId = String(postId);
  const [assets, postRows] = await Promise.all([
    db.select({ id: imageAssets.id, path: imageAssets.path }).from(imageAssets),
    db
      .select({
        id: posts.id,
        title: posts.title,
        imgUrl: posts.imgUrl,
        content: posts.content,
        enImgUrl: posts.enImgUrl,
        enContent: posts.enContent,
      })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1),
  ]);
  const references = postRows[0]
    ? dedupeImageReferences(buildPostImageReferences(postRows[0], assets))
    : [];

  await db.transaction(async (tx) => {
    await tx
      .delete(imageAssetReferences)
      .where(
        and(
          eq(imageAssetReferences.sourceType, "post"),
          eq(imageAssetReferences.sourceId, sourceId),
        ),
      );

    if (references.length > 0) {
      await tx.insert(imageAssetReferences).values(references);
    }
  });

  return { references: references.length };
}

export async function deleteImageReferencesForPosts(postIds: number[]) {
  const sourceIds = postIds
    .filter((postId) => Number.isInteger(postId) && postId > 0)
    .map(String);

  if (sourceIds.length === 0) {
    return { deleted: 0 };
  }

  const rows = await db
    .delete(imageAssetReferences)
    .where(
      and(
        eq(imageAssetReferences.sourceType, "post"),
        inArray(imageAssetReferences.sourceId, sourceIds),
      ),
    )
    .returning({ id: imageAssetReferences.id });

  return { deleted: rows.length };
}

export async function rebuildImageReferences() {
  const assets = await db
    .select({ id: imageAssets.id, path: imageAssets.path })
    .from(imageAssets);
  const findAsset = createAssetFinder(assets);
  const references: ImageReference[] = [];

  const [postRows, userRows] = await Promise.all([
    db
      .select({
        id: posts.id,
        title: posts.title,
        imgUrl: posts.imgUrl,
        content: posts.content,
        enImgUrl: posts.enImgUrl,
        enContent: posts.enContent,
      })
      .from(posts),
    db
      .select({
        id: users.id,
        username: users.username,
        image: users.image,
      })
      .from(users),
  ]);

  for (const post of postRows) {
    references.push(...buildPostImageReferences(post, assets));
  }

  for (const user of userRows) {
    const avatarAsset = findAsset(user.image);
    if (avatarAsset) {
      references.push({
        imageId: avatarAsset.id,
        sourceType: "user",
        sourceId: user.id,
        sourceLabel: user.username,
        field: "avatar",
      });
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(imageAssetReferences);
    const dedupedReferences = dedupeImageReferences(references);
    if (dedupedReferences.length > 0) {
      await tx.insert(imageAssetReferences).values(dedupedReferences);
    }
  });

  return { references: dedupeImageReferences(references).length };
}

export async function deleteImageAsset(id: number) {
  const [asset] = await db
    .select()
    .from(imageAssets)
    .where(eq(imageAssets.id, id))
    .limit(1);

  if (!asset) {
    return { error: "图片不存在" };
  }

  const references = await db
    .select({ id: imageAssetReferences.id })
    .from(imageAssetReferences)
    .where(eq(imageAssetReferences.imageId, id))
    .limit(1);

  if (references.length > 0) {
    return { error: "图片正在被内容引用，不能删除" };
  }

  await db.delete(imageAssets).where(eq(imageAssets.id, id));

  const filePath = uploadPathToFilePath(asset.path);
  if (existsSync(filePath)) {
    await unlink(filePath);
  }
  await removeVariantFiles(asset);

  return { data: asset };
}

export async function replaceImageReferences(input: {
  imageId: number;
  replacementPath: string;
}) {
  const [asset] = await db
    .select()
    .from(imageAssets)
    .where(eq(imageAssets.id, input.imageId))
    .limit(1);

  if (!asset) {
    return { error: "图片不存在" };
  }

  let replacementPath: string;
  try {
    replacementPath = normalizeUploadPath(input.replacementPath);
  } catch {
    return { error: "替换图片 URL 必须是 /uploads/ 下的有效图片路径" };
  }
  const [replacementAsset] = await db
    .select({ id: imageAssets.id })
    .from(imageAssets)
    .where(eq(imageAssets.path, replacementPath))
    .limit(1);

  if (!replacementAsset) {
    return { error: "替换图片不存在，请先上传或导入该图片" };
  }

  const siteBaseUrl = (
    process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com"
  ).replace(/\/+$/, "");
  const absoluteAssetPath = `${siteBaseUrl}${asset.path}`;
  const absoluteReplacementPath = `${siteBaseUrl}${replacementPath}`;

  await db.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({
        imgUrl: sql`replace(replace(${posts.imgUrl}, ${absoluteAssetPath}, ${absoluteReplacementPath}), ${asset.path}, ${replacementPath})`,
        updatedAt: new Date(),
      })
      .where(
        sql`${posts.imgUrl} like ${`%${asset.path}%`} or ${posts.imgUrl} like ${`%${absoluteAssetPath}%`}`,
      );

    await tx
      .update(posts)
      .set({
        content: sql`replace(replace(${posts.content}, ${absoluteAssetPath}, ${absoluteReplacementPath}), ${asset.path}, ${replacementPath})`,
        updatedAt: new Date(),
      })
      .where(
        sql`${posts.content} like ${`%${asset.path}%`} or ${posts.content} like ${`%${absoluteAssetPath}%`}`,
      );

    await tx
      .update(users)
      .set({
        image: sql`replace(replace(${users.image}, ${absoluteAssetPath}, ${absoluteReplacementPath}), ${asset.path}, ${replacementPath})`,
        updatedAt: new Date(),
      })
      .where(
        sql`${users.image} like ${`%${asset.path}%`} or ${users.image} like ${`%${absoluteAssetPath}%`}`,
      );
  });

  await rebuildImageReferences();
  return { data: true };
}

export async function findDuplicateImages() {
  const rows = await db
    .select({
      hash: imageAssets.hash,
      count: sql<number>`count(*)`,
    })
    .from(imageAssets)
    .where(sql`${imageAssets.hash} is not null`)
    .groupBy(imageAssets.hash)
    .having(sql`count(*) > 1`);

  return rows;
}

export function isUploadPath(value: string | null | undefined) {
  return Boolean(toUploadPath(value));
}
