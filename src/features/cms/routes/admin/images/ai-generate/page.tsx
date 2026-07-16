import Link from "next/link";
import { Settings2 } from "lucide-react";

import {
  AdminPageShell,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import { CustomImageGenerator } from "@/features/cms/components/custom-image-generator";
import { Button } from "@/components/ui/button";
import { requireAdminSession } from "@fwqgo/auth/session";
import {
  AdminSectionNav,
  imageGenerationNavItems,
} from "@/features/cms/components/admin-section-nav";

export default async function AiImageGenerationPage() {
  await requireAdminSession();

  return (
    <AdminPageShell
      badge="AI生图"
      title="AI 生图"
      description="输入图片要求后直接生成图片，并保存到图片资产库。"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/settings/image-generation">
            <Settings2 className="size-4" />
            生图接口配置
          </Link>
        </Button>
      }
    >
      <AdminSectionNav
        label="AI 生图功能"
        currentHref="/images/ai-generate"
        items={imageGenerationNavItems}
      />
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
