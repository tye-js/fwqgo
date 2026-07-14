import { AdminPageShell } from "@/features/cms/components/admin-page-shell";
import { ImageUploadWorkbench } from "@/features/cms/components/image-upload-workbench";
import { requireAdminSession } from "@fwqgo/auth/session";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Images } from "lucide-react";

export default async function ImageUploadPage() {
  await requireAdminSession();

  return (
    <AdminPageShell
      badge="媒体上传"
      title="上传图片"
      description="上传图片并自动写入图片资产库，非 GIF 图片会转换为 WebP。"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/images/list">
            <Images className="size-4" />
            查看图片资产
          </Link>
        </Button>
      }
    >
      <ImageUploadWorkbench />
    </AdminPageShell>
  );
}
