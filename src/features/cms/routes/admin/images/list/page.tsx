import { getImageAssetList, serializeImageAsset } from "@/server/images/assets";
import { requireAdminSession } from "@fwqgo/auth/session";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import { ImageAssetManager } from "@/features/cms/components/image-asset-manager";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

async function loadImageAssets() {
  try {
    const data = await getImageAssetList();
    return { data, error: null };
  } catch (error) {
    console.error("图片管理页加载图片资产失败:", error);
    return { data: [], error: getErrorMessage(error) };
  }
}

export default async function ImageListPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string;
    filter?: string;
    type?: string;
    status?: string;
  }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const { data: images, error: loadError } = await loadImageAssets();
  const imageTypes = new Set(images.map((image) => image.imageType));
  const imageStatuses = new Set(images.map((image) => image.status));
  const usageFilter = [
    "all",
    "used",
    "unused",
    "issues",
    "missing-alt",
    "duplicates",
  ].includes(params.filter ?? "")
    ? params.filter!
    : "all";
  const typeFilter = imageTypes.has(params.type ?? "") ? params.type! : "all";
  const statusFilter = imageStatuses.has(params.status ?? "")
    ? params.status!
    : "all";
  const usedCount = images.filter((image) => image.references.length > 0).length;
  const needsWebpCount = images.filter(
    (image) => image.mime !== "image/webp" && image.mime !== "image/gif",
  ).length;
  const totalSize = images.reduce((sum, image) => sum + image.size, 0);

  return (
    <AdminPageShell
      badge="图片资产"
      title="图片管理"
      description="集中查看上传图片、引用状态和文件信息，清理未使用图片前会先做引用检查。"
    >
      <AdminSummaryStrip
        items={[
          {
            label: "图片总数",
            value: images.length.toLocaleString("zh-CN"),
            note: "已入库的上传图片",
          },
          {
            label: "被引用",
            value: usedCount.toLocaleString("zh-CN"),
            note: "封面、正文或头像引用",
          },
          {
            label: "待转换",
            value: needsWebpCount.toLocaleString("zh-CN"),
            note: `非 WebP/GIF 图片，占用 ${formatBytes(totalSize)}`,
          },
        ]}
      />
      {loadError ? (
        <AdminSectionCard
          title="图片列表加载失败"
          description="无法读取图片资产列表。上传功能和文章封面字段不会被修改，请检查数据库连接、上传目录或后台日志。"
        >
          <p className="break-words text-sm text-destructive">{loadError}</p>
        </AdminSectionCard>
      ) : null}
      <ImageAssetManager
        images={images.map(serializeImageAsset)}
        initialQuery={params.query?.trim() ?? ""}
        initialUsageFilter={usageFilter}
        initialTypeFilter={typeFilter}
        initialStatusFilter={statusFilter}
      />
    </AdminPageShell>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
