import { getImageAssetList, serializeImageAsset } from "@/server/images/assets";
import { requireAdminSession } from "@fwqgo/auth/session";
import { AdminPageShell, AdminSummaryStrip } from "@/features/cms/components/admin-page-shell";
import { ImageAssetManager } from "@/features/cms/components/image-asset-manager";

export default async function ImageListPage() {
  await requireAdminSession();
  const images = await getImageAssetList();
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
      <ImageAssetManager
        images={images.map(serializeImageAsset)}
      />
    </AdminPageShell>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
