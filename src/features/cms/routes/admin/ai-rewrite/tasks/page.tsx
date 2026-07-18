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
} from "@/features/cms/components/admin-page-shell";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  FileText,
  ListTodo,
  Plus,
  RefreshCw,
} from "lucide-react";
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
  const pageTitle = isTaskCenter ? "AI任务中心" : "AI 生产台";
  const pageDescription = isTaskCenter
    ? "统一处理 AI 改写、封面生图和供应商采集任务。"
    : "";

  return (
    <AdminPageShell
      badge={isTaskCenter ? "AI 内容" : undefined}
      title={pageTitle}
      description={pageDescription}
      showHeading={isTaskCenter}
      actions={
        <div className="flex flex-wrap gap-2">
          {isTaskCenter ? (
            <Button asChild size="sm" variant="secondary">
              <Link href="/ai-rewrite/tasks#single-task">
                <Plus className="size-4" />
                创建 AI 任务
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="secondary">
              <Link href="/ai-tasks">
                <ListTodo className="size-4" />
                AI任务中心
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link href="/posts/drafts">
              <FileText className="size-4" />
              草稿箱
            </Link>
          </Button>
          {isTaskCenter ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/ai-tasks">
                <RefreshCw className="size-4" />
                刷新
              </Link>
            </Button>
          ) : null}
        </div>
      }
    >
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
            <section className="space-y-3">
              <UnifiedTaskList result={unifiedTaskList} />
            </section>
          ) : null}
        </>
      ) : (
        <>
          <section id="single-task" className="scroll-mt-24">
            <AiRewriteTaskManager
              tasks={tasks}
              categories={categories}
              rewriteStyles={rewriteStyles}
              showTaskList={false}
            />
          </section>

          <section id="source-sites" className="scroll-mt-24">
            <AiSourceSiteManager
              sites={sourceSites}
              categories={categories}
              rewriteStyles={rewriteStyles}
            />
          </section>
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
