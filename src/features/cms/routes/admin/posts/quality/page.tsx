import { Suspense } from "react";
import Link from "next/link";
import { Bot, ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AdminLoading } from "@/features/cms/components/admin-loading";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
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
  });

  return (
    <AdminPageShell
      badge="文章管理"
      title="发布质检"
      description="发布前集中检查 SEO、封面、中英文关系、返利审核和套餐提取结果；优先处理阻断项。"
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
      <AdminSummaryStrip
        items={[
          {
            label: "检查文章",
            value: report.summary.sampledPosts.toLocaleString("zh-CN"),
            note: `当前显示 ${report.summary.visiblePosts.toLocaleString("zh-CN")} 篇`,
          },
          {
            label: "有问题文章",
            value: report.summary.issuePosts.toLocaleString("zh-CN"),
            note: "包含阻断项和警告项",
          },
          {
            label: "阻断项",
            value: report.summary.blockerCount.toLocaleString("zh-CN"),
            note: `${report.summary.publishedWithIssues.toLocaleString("zh-CN")} 篇已发布仍有问题`,
          },
          {
            label: "警告项",
            value: report.summary.warningCount.toLocaleString("zh-CN"),
            note: "不一定阻止发布，但需要运营确认",
          },
        ]}
      />
      <AdminSectionCard
        title="质检清单"
        description="点击筛选条件会写入 URL；逐行进入文章编辑页处理标题、SEO、封面、返利和中英文关系。"
      >
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
