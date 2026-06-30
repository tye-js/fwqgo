import { AiRewriteTaskManager } from "@/app/_components/ai-rewrite-task-manager";
import { AiSourceSiteManager } from "@/app/_components/ai-source-site-manager";
import { getAiSourceSiteList } from "@/app/_actions/ai-source-site";
import { getAiRewriteTaskList } from "@/app/_actions/ai-rewrite-task";
import { getLeafCategories } from "@/app/_actions/category";
import { getAiRewriteStyleOptions } from "@/app/_actions/scrape";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/app/_components/admin-page-shell";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function AiRewriteTasksPage() {
  const [tasks, sourceSites, categoriesResult, rewriteStyles] = await Promise.all([
    getAiRewriteTaskList(),
    getAiSourceSiteList(),
    getLeafCategories(),
    getAiRewriteStyleOptions(),
  ]);
  const categories = categoriesResult.data ?? [];
  const runningCount = tasks.filter((task) =>
    ["pending", "running"].includes(task.status),
  ).length;
  const failedCount = tasks.filter((task) => task.status === "failed").length;
  const draftCount = tasks.filter((task) => task.postSlug).length;

  return (
    <AdminPageShell
      badge="AI 内容"
      title="内容生产台"
      description="输入来源 URL 后，系统在后台完成采集、清洗、AI 改写和草稿保存。"
      actions={
        <Button asChild variant="outline">
          <Link href="/end/posts/drafts">打开草稿箱</Link>
        </Button>
      }
    >
      <AdminSummaryStrip
        items={[
          {
            label: "最近任务",
            value: String(tasks.length),
            note: "保留最近 50 条",
          },
          {
            label: "处理中",
            value: String(runningCount),
            note: "抓取、改写、保存草稿",
          },
          {
            label: "已生成草稿",
            value: String(draftCount),
            note:
              failedCount > 0
                ? `${failedCount} 个失败任务可重新开始`
                : "可进入草稿箱人工编辑",
          },
        ]}
      />
      <AdminSectionCard
        title="来源站"
        description="保存常用中文来源站，需要时点击抓取新页面，系统会自动创建 AI 改写任务并在成功后保存为草稿。"
      >
        <AiSourceSiteManager
          sites={sourceSites}
          categories={categories}
          rewriteStyles={rewriteStyles}
        />
      </AdminSectionCard>
      <AdminSectionCard
        title="单篇采集"
        description="临时输入一个或多个文章 URL，直接加入采集改写队列。"
      >
      <AiRewriteTaskManager
        tasks={tasks}
        categories={categories}
        rewriteStyles={rewriteStyles}
      />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
