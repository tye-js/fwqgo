import Link from "next/link";
import { Settings2 } from "lucide-react";

import {
  AdminPageShell,
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
      <CustomImageGenerator />
    </AdminPageShell>
  );
}
