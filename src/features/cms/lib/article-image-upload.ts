/** 单张上限，与「插入图片」弹窗的提示文案一致。 */
export const ARTICLE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** 供 `<input type="file" accept>` 使用，与 `uploadArticleImageFile` 的校验一致。 */
export const ARTICLE_IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp";

/**
 * 已入库、等待操作者确认 alt 与图注的正文图片。
 *
 * 上传与「确认后插入」是两步：截图粘贴、本地上传都先走到这里，
 * 由「插入图片」弹窗让操作者补齐替代文本与图注，再写成正文 Markdown。
 * 这样正文里不会出现没有说明的图片。
 */
export type PendingArticleImage = {
  path: string;
  altZh: string | null;
  altEn: string | null;
  originalName: string;
};

/**
 * alt 的文件名兜底：去掉扩展名、下划线/连字符转空格。
 *
 * 归一化规则与上传接口的 `fallbackImageAlt`（`src/server/images/assets.ts`）保持一致——
 * 服务端在入库时就用它填了 `altZh` / `altEn`，所以这里通常只是最后一道保险。
 * 额外保证非空：正文图不该出现 `![](...)`。
 */
export function fallbackArticleImageAlt(originalName: string) {
  return (
    originalName
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "article image"
  );
}

/**
 * alt 的预填值：图片库的双语文案 → 文件名。
 *
 * 图片库里的 alt 是**封面语境**的文章标题文案（例如「Zgovps VPS 套餐评测：香港三网直连…」），
 * 直接拿来当正文图的 alt 并不贴切——正文图该描述图片本身。所以这里只做预填，
 * 操作者可以在弹窗里改掉。
 */
export function localizedArticleImageAlt(
  image: PendingArticleImage,
  language: "zh" | "en",
) {
  const localized = (language === "en" ? image.altEn : image.altZh)?.trim();
  return localized?.length ? localized : fallbackArticleImageAlt(image.originalName);
}

/**
 * 校验并上传一张正文图片，返回待确认的图片信息。
 *
 * 走的是与「插入图片」弹窗同一个 `/api/upload`：自动转 WebP、生成变体、写入
 * `imageAssets`，并按**内容哈希去重**——同一张截图重复粘贴不会产生重复资产。
 */
export async function uploadArticleImageFile(
  file: File,
): Promise<PendingArticleImage> {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
  if (file.size > ARTICLE_IMAGE_MAX_BYTES) throw new Error("图片大小不能超过 8MB");

  const formData = new FormData();
  // 剪贴板里的图片常常没有文件名（macOS 截图粘贴过来多是 `image.png`，
  // 有时 name 直接是空串）。给一个可读的兜底，否则 alt 的文件名兜底会变空。
  const uploadName = file.name?.trim() || `paste-${Date.now()}.png`;
  formData.append("file", file, uploadName);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });
  const data = (await response.json().catch(() => null)) as {
    data?: {
      url?: string;
      asset?: { altZh?: string | null; altEn?: string | null };
    };
    url?: string;
    error?: string;
    message?: string;
    actionError?: { message?: string };
  } | null;
  const uploadedPath = data?.data?.url ?? data?.url;

  if (!response.ok || !uploadedPath) {
    throw new Error(
      data?.actionError?.message ??
        data?.message ??
        data?.error ??
        `上传失败，HTTP ${response.status}`,
    );
  }

  return {
    path: uploadedPath,
    altZh: data?.data?.asset?.altZh ?? null,
    altEn: data?.data?.asset?.altEn ?? null,
    originalName: uploadName,
  };
}

/**
 * 从粘贴事件里取出图片文件。
 *
 * 返回空数组表示这次粘贴不是图片（普通文本），调用方必须**放行浏览器默认行为**，
 * 否则正文里的文字就粘不进去了。
 */
export function extractClipboardImageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];

  const files: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}
