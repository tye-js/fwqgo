import { AdminPageShell } from "@/features/cms/components/admin-page-shell";
import { ImageUploadWorkbench } from "@/features/cms/components/image-upload-workbench";
import { requireAdminSession } from "@fwqgo/auth/session";

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
