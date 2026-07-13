import { AiRewriteTaskManager } from "@/features/cms/components/ai-rewrite-task-manager";
import { AiSourceSiteManager } from "@/features/cms/components/ai-source-site-manager";
import { CmsTaskOperationsOverview } from "@/features/cms/components/cms-task-operations-overview";
import { UnifiedTaskList } from "@/features/cms/components/unified-task-list";
import { getAiSourceSiteList } from "@/features/cms/actions/ai-source-site";
import { getAiRewriteTaskList } from "@/features/cms/actions/ai-rewrite-task";
import {
  getCmsTaskOperationsSummary,
  getUnifiedTaskList,
} from "@/features/cms/data/operations";
import { getLeafCategories } from "@/features/shared/data/category";
import { getAiRewriteStyleOptions } from "@/features/cms/actions/scrape";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FileText, Plus, RefreshCw } from "lucide-react";
import { parsePositiveInt } from "@fwqgo/core/utils";

type AiRewriteTasksPageVariant = "production" | "task-center";
type AiRewriteTaskSearchParams = {
  pageNo?: string;
  status?: string;
  sourceType?: string;
  language?: string;
  query?: string;
  type?: string;
};

type PageDataError = {
  label: string;
  message: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

async function loadPageData<T>(
  label: string,
  promise: Promise<T>,
): Promise<{ data: T | null; error: PageDataError | null }> {
  try {
    return { data: await promise, error: null };
  } catch (error) {
    console.error(`${label} 加载失败:`, error);
    return {
      data: null,
      error: {
        label,
        message: getErrorMessage(error),
      },
    };
  }
}

function parsePageNo(value: string | undefined) {
  return parsePositiveInt(value) ?? 1;
}

export async function AiRewriteTasksPageContent({
  variant = "production",
  searchParamsPromise,
}: {
  variant?: AiRewriteTasksPageVariant;
  searchParamsPromise?: Promise<AiRewriteTaskSearchParams>;
}) {
  const searchParams = (await searchParamsPromise) ?? {};
  const isTaskCenter = variant === "task-center";
  const [
    tasksResult,
    sourceSitesResult,
    categoriesResult,
    rewriteStylesResult,
    operationsSummaryResult,
    unifiedTaskListResult,
  ] = await Promise.all([
    loadPageData(
      "AI 改写任务列表",
      isTaskCenter
        ? Promise.resolve([])
        : getAiRewriteTaskList({ pageSize: 50 }),
    ),
    loadPageData(
      "来源站列表",
      isTaskCenter ? Promise.resolve([]) : getAiSourceSiteList(),
    ),
    loadPageData(
      "分类列表",
      isTaskCenter
        ? Promise.resolve({
            data: [],
          } as Awaited<ReturnType<typeof getLeafCategories>>)
        : getLeafCategories(),
    ),
    loadPageData(
      "AI 改写风格",
      isTaskCenter ? Promise.resolve([]) : getAiRewriteStyleOptions(),
    ),
    loadPageData(
      "任务队列健康",
      isTaskCenter ? getCmsTaskOperationsSummary() : Promise.resolve(null),
    ),
    loadPageData(
      "统一任务列表",
      isTaskCenter
        ? getUnifiedTaskList({
            type: searchParams.type,
            status: searchParams.status,
            query: searchParams.query,
            pageNo: parsePageNo(searchParams.pageNo),
            pageSize: 20,
          })
        : Promise.resolve(null),
    ),
  ]);
  const dataErrors = [
    tasksResult.error,
    sourceSitesResult.error,
    categoriesResult.error,
    rewriteStylesResult.error,
    operationsSummaryResult.error,
    unifiedTaskListResult.error,
  ].filter((error): error is PageDataError => Boolean(error));
  const tasks = tasksResult.data ?? [];
  const sourceSites = sourceSitesResult.data ?? [];
  const categories = categoriesResult.data?.data ?? [];
  const rewriteStyles = rewriteStylesResult.data ?? [];
  const operationsSummary = operationsSummaryResult.data;
  const unifiedTaskList = unifiedTaskListResult.data;
  const runningCount = tasks.filter((task) =>
    ["pending", "running"].includes(task.status),
  ).length;
  const failedCount = tasks.filter((task) => task.status === "failed").length;
  const manualRequiredCount = tasks.filter(
    (task) => task.status === "manual_required",
  ).length;
  const draftCount = tasks.filter((task) => task.postSlug).length;
  const pageTitle = isTaskCenter ? "AI任务中心" : "内容生产台";
  const pageDescription = isTaskCenter
    ? "统一处理 AI 改写、封面生图和套餐提取任务。"
    : "输入来源 URL 后，系统在后台完成采集、清洗、AI 改写和草稿保存。";

  return (
    <AdminPageShell
      badge="AI 内容"
      title={pageTitle}
      description={pageDescription}
      actions={
        <div className="flex flex-wrap gap-2">
          {isTaskCenter ? (
            <Button asChild>
              <Link href="/ai-rewrite/tasks#single-task">
                <Plus className="size-4" />
                创建 AI 任务
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/posts/drafts">
              <FileText className="size-4" />
              草稿箱
            </Link>
          </Button>
          {isTaskCenter ? (
            <Button asChild variant="outline">
              <Link href="/ai-tasks">
                <RefreshCw className="size-4" />
                刷新
              </Link>
            </Button>
          ) : null}
        </div>
      }
    >
      {!isTaskCenter ? (
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
      ) : null}
      {dataErrors.length > 0 ? (
        <AdminSectionCard
          title="部分数据加载失败"
          description="页面已尽量展示可用内容；失败模块可按下面的原因检查数据库连接、迁移或后台日志。"
        >
          <div className="space-y-2">
            {dataErrors.map((error) => (
              <div
                key={`${error.label}-${error.message}`}
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
              >
                <p className="text-sm font-medium text-destructive">
                  {error.label}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {error.message}
                </p>
              </div>
            ))}
          </div>
        </AdminSectionCard>
      ) : null}
      {isTaskCenter ? (
        <>
          {operationsSummary ? (
            <CmsTaskOperationsOverview summary={operationsSummary} />
          ) : null}
          {unifiedTaskList ? (
            <section aria-labelledby="task-list-title" className="space-y-3">
              <div className="space-y-1">
                <h2 id="task-list-title" className="text-sm font-semibold">
                  任务列表
                </h2>
                <p className="text-xs leading-5 text-muted-foreground">
                  筛选任务并处理失败、取消和人工确认；点击任务名称查看完整步骤和日志。
                </p>
              </div>
              <UnifiedTaskList result={unifiedTaskList} />
            </section>
          ) : null}
        </>
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
                showTaskList={false}
              />
            </AdminSectionCard>
          </div>
        </>
      )}
    </AdminPageShell>
  );
}

export default async function AiRewriteTasksPage(props: {
  searchParams: Promise<AiRewriteTaskSearchParams>;
}) {
  return <AiRewriteTasksPageContent searchParamsPromise={props.searchParams} />;
}
