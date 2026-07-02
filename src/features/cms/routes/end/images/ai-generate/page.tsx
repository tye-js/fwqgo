import { AdminPageShell, AdminSummaryStrip } from "@/features/cms/components/admin-page-shell";
import { CustomImageGenerator } from "@/features/cms/components/custom-image-generator";
import { requireAdminSession } from "@fwqgo/auth/session";

export default async function AiImageGenerationPage() {
  await requireAdminSession();

  return (
    <AdminPageShell
      badge="AI生图"
      title="AI 生图"
      description="输入图片要求后直接生成图片，并保存到图片资产库。"
    >
      <AdminSummaryStrip
        items={[
          {
            label: "用途",
            value: "通用生图",
            note: "适合封面、配图、活动素材",
          },
          {
            label: "保存位置",
            value: "图片资产",
            note: "生成后可复制 URL 或二次引用",
          },
          {
            label: "格式",
            value: "WebP",
            note: "非 GIF 图片会自动优化转换",
          },
        ]}
      />
      <CustomImageGenerator />
    </AdminPageShell>
  );
}
