import { AdminPageShell } from "@/app/_components/admin-page-shell";
import { ImageUploadWorkbench } from "@/app/_components/image-upload-workbench";
import { requireAdminSession } from "@/server/auth/session";

export default async function ImageUploadPage() {
  await requireAdminSession();

  return (
    <AdminPageShell
      badge="媒体上传"
      title="上传图片"
      description="上传图片并自动写入图片资产库，非 GIF 图片会转换为 WebP。"
    >
      <ImageUploadWorkbench />
    </AdminPageShell>
  );
}
