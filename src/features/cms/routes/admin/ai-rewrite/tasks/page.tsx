import { AiRewriteTaskManager } from "@/features/cms/components/ai-rewrite-task-manager";
import { AiSourceSiteManager } from "@/features/cms/components/ai-source-site-manager";
import { CmsTaskOperationsOverview } from "@/features/cms/components/cms-task-operations-overview";
import { UnifiedTaskList } from "@/features/cms/components/unified-task-list";
import { getAiSourceSiteList } from "@/features/cms/actions/ai-source-site";
import {
  getAiRewriteTaskCount,
  getAiRewriteTaskList,
} from "@/features/cms/actions/ai-rewrite-task";
import {
  getCmsTaskOperationsSummary,
  getUnifiedTaskList,
} from "@/features/cms/data/operations";
import {
  aiRewriteTaskSourceTypeFilters,
  aiRewriteTaskStatusFilters,
  type AiRewriteTaskLanguageFilter,
  type AiRewriteTaskListFilters,
  type AiRewriteTaskSourceTypeFilter,
  type AiRewriteTaskStatusFilter,
} from "@/features/cms/lib/ai-rewrite-task-filters";
import { getLeafCategories } from "@/features/shared/data/category";
import { getAiRewriteStyleOptions } from "@/features/cms/actions/scrape";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import { Button } from "@/components/ui/button";
import Link from "next/link";
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

function parsePageNo(value: string | undefined) {
  return parsePositiveInt(value) ?? 1;
}

function parseAiTaskFilters(
  params: AiRewriteTaskSearchParams = {},
): Required<
  Pick<
    AiRewriteTaskListFilters,
    "pageNo" | "pageSize" | "status" | "sourceType" | "language" | "query"
  >
> {
  const status = aiRewriteTaskStatusFilters.includes(
    params.status as (typeof aiRewriteTaskStatusFilters)[number],
  )
    ? (params.status as AiRewriteTaskStatusFilter)
    : "all";
  const sourceType = aiRewriteTaskSourceTypeFilters.includes(
    params.sourceType as (typeof aiRewriteTaskSourceTypeFilters)[number],
  )
    ? (params.sourceType as AiRewriteTaskSourceTypeFilter)
    : "all";
  const language: AiRewriteTaskLanguageFilter =
    params.language === "zh" || params.language === "en"
      ? params.language
      : "all";

  return {
    pageNo: parsePageNo(params.pageNo),
    pageSize: 20,
    status,
    sourceType,
    language,
    query: params.query?.trim() ?? "",
  };
}

export async function AiRewriteTasksPageContent({
  variant = "production",
  searchParamsPromise,
}: {
  variant?: AiRewriteTasksPageVariant;
  searchParamsPromise?: Promise<AiRewriteTaskSearchParams>;
}) {
  const searchParams = (await searchParamsPromise) ?? {};
  const taskFilters = parseAiTaskFilters(searchParams);
  const isTaskCenter = variant === "task-center";
  const [
    tasks,
    taskCount,
    sourceSites,
    categoriesResult,
    rewriteStyles,
    operationsSummary,
    unifiedTaskList,
  ] = await Promise.all([
    getAiRewriteTaskList(isTaskCenter ? taskFilters : { pageSize: 50 }),
    getAiRewriteTaskCount(isTaskCenter ? taskFilters : {}),
    getAiSourceSiteList(),
    getLeafCategories(),
    getAiRewriteStyleOptions(),
    isTaskCenter ? getCmsTaskOperationsSummary() : Promise.resolve(null),
    isTaskCenter
      ? getUnifiedTaskList({
          type: searchParams.type,
          status: searchParams.status,
          query: searchParams.query,
          pageNo: parsePageNo(searchParams.pageNo),
          pageSize: 20,
        })
      : Promise.resolve(null),
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
  const totalPage = Math.ceil(taskCount / taskFilters.pageSize);
  const pageTitle = isTaskCenter ? "AI任务中心" : "内容生产台";
  const pageDescription = isTaskCenter
    ? "集中查看 AI 改写、封面生图、套餐提取的队列进度、步骤日志、失败原因和恢复操作。"
    : "输入来源 URL 后，系统在后台完成采集、清洗、AI 改写和草稿保存。";
  const allTaskTotal = operationsSummary
    ? operationsSummary.queues.ai.total +
      operationsSummary.queues.cover.total +
      operationsSummary.queues.offer.total
    : tasks.length;
  const allTaskActive = operationsSummary
    ? operationsSummary.queues.ai.active +
      operationsSummary.queues.cover.active +
      operationsSummary.queues.offer.active
    : runningCount;
  const allTaskFailed = operationsSummary
    ? operationsSummary.queues.ai.failed +
      operationsSummary.queues.cover.failed +
      operationsSummary.queues.offer.failed
    : failedCount;

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
            label: isTaskCenter ? "全部任务" : "最近任务",
            value: String(allTaskTotal),
            note: isTaskCenter ? "AI、封面、套餐" : "保留最近 50 条",
          },
          {
            label: "处理中",
            value: String(allTaskActive),
            note: isTaskCenter ? "排队和运行中" : "抓取、改写、保存草稿",
          },
          {
            label: isTaskCenter ? "失败任务" : "已生成草稿",
            value: String(isTaskCenter ? allTaskFailed : draftCount),
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
        <>
          {operationsSummary ? (
            <CmsTaskOperationsOverview summary={operationsSummary} />
          ) : null}
          {unifiedTaskList ? (
            <AdminSectionCard
              title="全部任务"
              description="统一查看 AI 改写、封面生图和套餐提取任务；进入详情页可查看步骤日志、失败原因、重试、取消和恢复。"
            >
              <UnifiedTaskList result={unifiedTaskList} />
            </AdminSectionCard>
          ) : null}
          <AdminSectionCard
            title="AI 改写明细"
            description="AI 专项列表保留采集来源、语言、模型、Token 和草稿结果等细节。运行中的任务会自动刷新。"
          >
            <AiRewriteTaskManager
              tasks={tasks}
              categories={categories}
              rewriteStyles={rewriteStyles}
              basePath="/ai-tasks"
              showCreateForm={false}
              filters={taskFilters}
              totalCount={taskCount}
              totalPage={totalPage}
            />
          </AdminSectionCard>
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
