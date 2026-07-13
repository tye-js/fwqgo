import { AiRewriteTaskManager } from "@/features/cms/components/ai-rewrite-task-manager";
import { AiSourceSiteManager } from "@/features/cms/components/ai-source-site-manager";
import { CmsTaskOperationsOverview } from "@/features/cms/components/cms-task-operations-overview";
import { UnifiedTaskList } from "@/features/cms/components/unified-task-list";
import { getAiSourceSiteList } from "@/features/cms/actions/ai-source-site";
import {
  getAiRewriteTaskList,
  getAiRewriteTaskStatusSummary,
} from "@/features/cms/actions/ai-rewrite-task";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  AlertCircle,
  CircleDashed,
  FileCheck2,
  FileText,
  ListTodo,
  Plus,
  RefreshCw,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import { cn, parsePositiveInt } from "@fwqgo/core/utils";

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

function ProductionStatusStrip({
  items,
}: {
  items: Array<{
    label: string;
    value: number;
    note: string;
    href: string;
    icon: LucideIcon;
    tone?: "neutral" | "warning" | "critical";
  }>;
}) {
  return (
    <section
      aria-label="生产状态"
      className="grid gap-px overflow-hidden rounded-md border border-border/70 bg-border/70 sm:grid-cols-2 xl:grid-cols-4"
    >
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <Link
            key={item.label}
            href={item.href}
            className="group flex min-h-[88px] items-start gap-3 bg-card px-3 py-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground",
                item.tone === "warning" &&
                  "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                item.tone === "critical" &&
                  "bg-destructive/10 text-destructive",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">
                  {item.label}
                </span>
                <strong className="text-xl font-semibold tabular-nums text-foreground">
                  {item.value.toLocaleString("zh-CN")}
                </strong>
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {item.note}
              </span>
            </span>
          </Link>
        );
      })}
    </section>
  );
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
    taskStatusSummaryResult,
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
      "AI 任务状态统计",
      isTaskCenter ? Promise.resolve(null) : getAiRewriteTaskStatusSummary(),
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
    taskStatusSummaryResult.error,
    sourceSitesResult.error,
    categoriesResult.error,
    rewriteStylesResult.error,
    operationsSummaryResult.error,
    unifiedTaskListResult.error,
  ].filter((error): error is PageDataError => Boolean(error));
  const tasks = tasksResult.data ?? [];
  const taskStatusSummary = taskStatusSummaryResult.data;
  const sourceSites = sourceSitesResult.data ?? [];
  const categories = categoriesResult.data?.data ?? [];
  const rewriteStyles = rewriteStylesResult.data ?? [];
  const operationsSummary = operationsSummaryResult.data;
  const unifiedTaskList = unifiedTaskListResult.data;
  const runningCount =
    taskStatusSummary?.active ??
    tasks.filter((task) => ["pending", "running"].includes(task.status)).length;
  const failedCount =
    taskStatusSummary?.failed ??
    tasks.filter((task) => task.status === "failed").length;
  const manualRequiredCount =
    taskStatusSummary?.manualRequired ??
    tasks.filter((task) => task.status === "manual_required").length;
  const draftCount =
    taskStatusSummary?.generatedDrafts ??
    tasks.filter(
      (task) =>
        Boolean(task.postSlug) &&
        ["succeeded", "manual_required"].includes(task.status),
    ).length;
  const enabledSourceCount = sourceSites.filter((site) => site.enabled).length;
  const pageTitle = isTaskCenter ? "AI任务中心" : "AI 生产台";
  const pageDescription = isTaskCenter
    ? "统一处理 AI 改写、封面生图和套餐提取任务。"
    : "";

  return (
    <AdminPageShell
      badge="AI 内容"
      title={pageTitle}
      description={pageDescription}
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
      {!isTaskCenter ? (
        <ProductionStatusStrip
          items={[
            {
              label: "处理中",
              value: runningCount,
              note: "等待与运行中的任务",
              href: "/ai-tasks?type=ai&status=active",
              icon: CircleDashed,
            },
            {
              label: "失败",
              value: failedCount,
              note: "可进入任务中心重试",
              href: "/ai-tasks?type=ai&status=failed",
              icon: AlertCircle,
              tone: failedCount > 0 ? "critical" : "neutral",
            },
            {
              label: "待人工",
              value: manualRequiredCount,
              note: "需要人工确认的任务",
              href: "/ai-tasks?type=ai&status=manual_required",
              icon: UserRoundCheck,
              tone: manualRequiredCount > 0 ? "warning" : "neutral",
            },
            {
              label: "已生成草稿",
              value: draftCount,
              note: "成功或待人工任务",
              href: "/posts/drafts",
              icon: FileCheck2,
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
          <section id="single-task" className="scroll-mt-24 space-y-2.5">
            <div className="border-b border-border/60 pb-2">
              <h2 className="text-sm font-semibold">新建任务</h2>
            </div>
            <AiRewriteTaskManager
              tasks={tasks}
              categories={categories}
              rewriteStyles={rewriteStyles}
              showTaskList={false}
            />
          </section>

          <section id="source-sites" className="scroll-mt-24 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-2">
              <h2 className="text-sm font-semibold">来源站批量抓取</h2>
              <Badge variant="outline">
                {enabledSourceCount}/{sourceSites.length} 启用
              </Badge>
            </div>
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
