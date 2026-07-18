import { Suspense } from "react";
import Link from "next/link";
import { Bot, ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AdminLoading } from "@/features/cms/components/admin-loading";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { PostQualityWorkbench } from "@/features/cms/components/post-quality-workbench";
import { getPostQualityReport } from "@/features/cms/data/post-quality";

type PostQualitySearchParams = {
  language?: string;
  issue?: string;
};

async function PostQualityWrapper({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<PostQualitySearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  const report = await getPostQualityReport({
    language: searchParams.language,
    issue: searchParams.issue,
  }).catch((error: unknown) => {
    console.error("发布质检页加载失败:", error);
    return null;
  });

  if (!report) {
    return (
      <AdminPageShell
        badge="文章管理"
        title="发布质检"
        description="发布前检查 SEO、封面、中英文关系、返利审核和套餐文章关系。"
      >
        <AdminSectionCard
          title="质检数据加载失败"
          description="无法读取文章质检结果。文章不会被修改，请检查数据库连接、迁移状态或后台日志。"
        >
          <p className="text-sm text-destructive">
            当前无法生成质检报告，请稍后刷新重试。
          </p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      badge="文章管理"
      title="发布质检"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/ai-tasks">
              <Bot className="size-4" />
              AI任务中心
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/images/covers">
              <ImagePlus className="size-4" />
              封面生图
            </Link>
          </Button>
        </div>
      }
    >
      <AdminSectionCard>
        <PostQualityWorkbench report={report} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function PostQualityPage(props: {
  searchParams: Promise<PostQualitySearchParams>;
}) {
  return (
    <Suspense
      fallback={
        <AdminLoading
          badge="文章管理"
          title="正在加载发布质检"
          description="正在检查文章 SEO、封面、中英文关系和运营状态。"
        />
      }
    >
      <PostQualityWrapper searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}
