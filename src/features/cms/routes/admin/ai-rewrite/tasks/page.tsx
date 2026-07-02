import { AiRewriteTaskManager } from "@/features/cms/components/ai-rewrite-task-manager";
import { AiSourceSiteManager } from "@/features/cms/components/ai-source-site-manager";
import { getAiSourceSiteList } from "@/features/cms/actions/ai-source-site";
import { getAiRewriteTaskList } from "@/features/cms/actions/ai-rewrite-task";
import { getLeafCategories } from "@/features/shared/data/category";
import { getAiRewriteStyleOptions } from "@/features/cms/actions/scrape";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type AiRewriteTasksPageVariant = "production" | "task-center";

export async function AiRewriteTasksPageContent({
  variant = "production",
}: {
  variant?: AiRewriteTasksPageVariant;
}) {
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
  const manualRequiredCount = tasks.filter(
    (task) => task.status === "manual_required",
  ).length;
  const draftCount = tasks.filter((task) => task.postSlug).length;
  const isTaskCenter = variant === "task-center";
  const pageTitle = isTaskCenter ? "AI任务中心" : "内容生产台";
  const pageDescription = isTaskCenter
    ? "集中查看 AI 采集、清洗、改写、英文生成、草稿保存的队列进度和失败原因。"
    : "输入来源 URL 后，系统在后台完成采集、清洗、AI 改写和草稿保存。";

  return (
    <AdminPageShell
      badge="AI 内容"
      title={pageTitle}
      description={pageDescription}
      actions={
        <div className="flex flex-wrap gap-2">
          {isTaskCenter ? (
            <Button asChild variant="outline">
              <Link href="/ai-rewrite/tasks#single-task">创建 AI 任务</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/posts/drafts">打开草稿箱</Link>
          </Button>
        </div>
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
              manualRequiredCount > 0
                ? `${manualRequiredCount} 个草稿需人工处理外链`
                : failedCount > 0
                ? `${failedCount} 个失败任务可重新开始`
                : "可进入草稿箱人工编辑",
          },
        ]}
      />
      {isTaskCenter ? (
        <AdminSectionCard
          title="任务看板"
          description="按任务状态、进度、失败原因和草稿结果查看 AI 处理链路。运行中的任务会自动刷新。"
        >
          <AiRewriteTaskManager
            tasks={tasks}
            categories={categories}
            rewriteStyles={rewriteStyles}
            basePath="/ai-tasks"
            showCreateForm={false}
          />
        </AdminSectionCard>
      ) : (
        <>
          <div id="source-sites" className="scroll-mt-24">
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
          </div>
          <div id="single-task" className="scroll-mt-24">
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
          </div>
        </>
      )}
    </AdminPageShell>
  );
}

export default async function AiRewriteTasksPage() {
  return <AiRewriteTasksPageContent />;
}
