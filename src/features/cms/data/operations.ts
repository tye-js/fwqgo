import { and, count, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";

import { requireAdminSession } from "@fwqgo/auth/session";
import { db } from "@fwqgo/db";
import {
  aiRewriteTasks,
  imageAssets,
  imageCoverGenerationTasks,
  posts,
  serverOfferImportTasks,
} from "@fwqgo/db/schema";
import { ensureCmsBackgroundWorkersForRecoverableTasks } from "@/server/admin/cms-background-workers";
import {
  getAdminBackgroundJobSnapshots,
  getAdminBackgroundWorkerRuntimeSnapshot,
} from "@/server/admin/background-jobs";
import { getAdminRuntimeSnapshot } from "@/server/admin/runtime-observability";
import { ilikeContains } from "@/server/db/search";

type StatusCountRow = {
  status: string;
  count: number;
};

type TaskStatusSummary = {
  total: number;
  active: number;
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  manualRequired: number;
  byStatus: StatusCountRow[];
};

type RecentFailure = {
  source: "ai" | "cover" | "offer";
  id: number;
  title: string;
  status: string;
  message: string;
  href: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type StaleTask = {
  source: "ai" | "cover" | "offer";
  id: number;
  title: string;
  status: string;
  href: string;
  lastTouchedAt: string | null;
  ageMinutes: number | null;
};

export type UnifiedTaskType = "all" | "ai" | "cover" | "offer";
export type UnifiedTaskStatusFilter =
  | "all"
  | "active"
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "manual_required"
  | "cancelled";

export type UnifiedTaskListFilters = {
  type?: string;
  status?: string;
  query?: string;
  pageNo?: number;
  pageSize?: number;
};

export type UnifiedTaskListItem = {
  uid: string;
  type: Exclude<UnifiedTaskType, "all">;
  id: number;
  title: string;
  status: string;
  progress: number;
  description: string;
  error: string | null;
  href: string;
  sourceLabel: string;
  post: {
    id: number;
    title: string;
    slug: string;
    language: string;
  } | null;
  createdAt: string | null;
  updatedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  canRetry: boolean;
  canCancel: boolean;
  canResolve: boolean;
};

type UnifiedTaskStep = {
  key: string;
  name: string;
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  description: string;
  time: string | null;
  payload?: string | null;
};

function normalizeUnifiedTaskType(value: string | undefined): UnifiedTaskType {
  return value === "ai" || value === "cover" || value === "offer"
    ? value
    : "all";
}

function normalizeUnifiedTaskStatus(
  value: string | undefined,
): UnifiedTaskStatusFilter {
  const allowed = new Set<UnifiedTaskStatusFilter>([
    "all",
    "active",
    "pending",
    "running",
    "succeeded",
    "failed",
    "manual_required",
    "cancelled",
  ]);

  return allowed.has(value as UnifiedTaskStatusFilter)
    ? (value as UnifiedTaskStatusFilter)
    : "all";
}

function normalizeUnifiedTaskListFilters(input: UnifiedTaskListFilters = {}) {
  const pageNo =
    Number.isInteger(input.pageNo) && (input.pageNo ?? 0) > 0
      ? input.pageNo!
      : 1;
  const pageSize =
    Number.isInteger(input.pageSize) && (input.pageSize ?? 0) > 0
      ? Math.min(input.pageSize!, 100)
      : 20;

  return {
    type: normalizeUnifiedTaskType(input.type),
    status: normalizeUnifiedTaskStatus(input.status),
    query: input.query?.trim() ?? "",
    pageNo,
    pageSize,
    offset: (pageNo - 1) * pageSize,
  };
}

function statusConditions<T extends { status: unknown }>(
  column: T["status"],
  status: UnifiedTaskStatusFilter,
) {
  if (status === "all") return undefined;
  if (status === "active") {
    return inArray(column as never, ["pending", "running"]);
  }

  return eq(column as never, status);
}

function andMaybe(...conditions: Array<SQL<unknown> | undefined>) {
  const validConditions = conditions.filter(
    (condition): condition is SQL<unknown> => Boolean(condition),
  );
  return validConditions.length > 0 ? and(...validConditions) : undefined;
}

function serializeProgress(value: number | null | undefined, status: string) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (status === "succeeded") return 100;
  if (status === "failed" || status === "cancelled") return 100;
  if (status === "running") return 50;
  return 0;
}

function terminalStatus(status: string) {
  return (
    status === "succeeded" || status === "failed" || status === "cancelled"
  );
}

function stepStatusForTask(status: string): UnifiedTaskStep["status"] {
  if (status === "succeeded") return "success";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "running") return "running";
  return "pending";
}

function serializeDate(value: Date | string | null | undefined) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toStatusSummary(rows: StatusCountRow[]): TaskStatusSummary {
  const countByStatus = new Map(
    rows.map((row) => [row.status, Number(row.count) || 0]),
  );
  const total = rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const pending = countByStatus.get("pending") ?? 0;
  const running = countByStatus.get("running") ?? 0;

  return {
    total,
    active: pending + running,
    pending,
    running,
    succeeded: countByStatus.get("succeeded") ?? 0,
    failed: countByStatus.get("failed") ?? 0,
    manualRequired: countByStatus.get("manual_required") ?? 0,
    byStatus: rows,
  };
}

function failureMessage(...values: Array<string | null | undefined>) {
  return (
    values.find((value) => value && value.trim().length > 0) ?? "未记录失败原因"
  );
}

function taskTitle(...values: Array<string | null | undefined>) {
  return (
    values.find((value) => value && value.trim().length > 0) ?? "未命名任务"
  );
}

function ageMinutesFrom(value: Date | string | null | undefined) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
}

function activeTaskRowToStaleTask(input: {
  source: StaleTask["source"];
  id: number;
  title: string;
  status: string;
  href: string;
  updatedAt?: Date | string | null;
  startedAt?: Date | string | null;
  createdAt?: Date | string | null;
}): StaleTask {
  const lastTouchedAt =
    input.updatedAt ?? input.startedAt ?? input.createdAt ?? null;

  return {
    source: input.source,
    id: input.id,
    title: input.title,
    status: input.status,
    href: input.href,
    lastTouchedAt: serializeDate(lastTouchedAt),
    ageMinutes: ageMinutesFrom(lastTouchedAt),
  };
}

export async function getCmsTaskOperationsSummary() {
  await requireAdminSession();
  await ensureCmsBackgroundWorkersForRecoverableTasks();

  const [
    aiStatusRows,
    coverStatusRows,
    offerStatusRows,
    aiFailures,
    coverFailures,
    offerFailures,
    aiActiveTasks,
    coverActiveTasks,
    offerActiveTasks,
    backgroundJobs,
  ] = await Promise.all([
    db
      .select({ status: aiRewriteTasks.status, count: count() })
      .from(aiRewriteTasks)
      .groupBy(aiRewriteTasks.status),
    db
      .select({ status: imageCoverGenerationTasks.status, count: count() })
      .from(imageCoverGenerationTasks)
      .groupBy(imageCoverGenerationTasks.status),
    db
      .select({ status: serverOfferImportTasks.status, count: count() })
      .from(serverOfferImportTasks)
      .groupBy(serverOfferImportTasks.status),
    db
      .select({
        id: aiRewriteTasks.id,
        status: aiRewriteTasks.status,
        sourceUrl: aiRewriteTasks.sourceUrl,
        sourceTitle: aiRewriteTasks.sourceTitle,
        resultTitle: aiRewriteTasks.resultTitle,
        error: aiRewriteTasks.error,
        createdAt: aiRewriteTasks.createdAt,
        updatedAt: aiRewriteTasks.updatedAt,
      })
      .from(aiRewriteTasks)
      .where(eq(aiRewriteTasks.status, "failed"))
      .orderBy(desc(aiRewriteTasks.updatedAt), desc(aiRewriteTasks.createdAt))
      .limit(5),
    db
      .select({
        id: imageCoverGenerationTasks.id,
        postId: imageCoverGenerationTasks.postId,
        title: imageCoverGenerationTasks.title,
        status: imageCoverGenerationTasks.status,
        errorTitle: imageCoverGenerationTasks.errorTitle,
        errorDetail: imageCoverGenerationTasks.errorDetail,
        createdAt: imageCoverGenerationTasks.createdAt,
        updatedAt: imageCoverGenerationTasks.updatedAt,
      })
      .from(imageCoverGenerationTasks)
      .where(eq(imageCoverGenerationTasks.status, "failed"))
      .orderBy(
        desc(imageCoverGenerationTasks.updatedAt),
        desc(imageCoverGenerationTasks.createdAt),
      )
      .limit(5),
    db
      .select({
        id: serverOfferImportTasks.id,
        postId: serverOfferImportTasks.postId,
        mode: serverOfferImportTasks.mode,
        status: serverOfferImportTasks.status,
        message: serverOfferImportTasks.message,
        errorTitle: serverOfferImportTasks.errorTitle,
        errorDetail: serverOfferImportTasks.errorDetail,
        createdAt: serverOfferImportTasks.createdAt,
        updatedAt: serverOfferImportTasks.updatedAt,
      })
      .from(serverOfferImportTasks)
      .where(eq(serverOfferImportTasks.status, "failed"))
      .orderBy(
        desc(serverOfferImportTasks.updatedAt),
        desc(serverOfferImportTasks.createdAt),
      )
      .limit(5),
    db
      .select({
        id: aiRewriteTasks.id,
        status: aiRewriteTasks.status,
        sourceUrl: aiRewriteTasks.sourceUrl,
        sourceTitle: aiRewriteTasks.sourceTitle,
        resultTitle: aiRewriteTasks.resultTitle,
        startedAt: aiRewriteTasks.startedAt,
        createdAt: aiRewriteTasks.createdAt,
        updatedAt: aiRewriteTasks.updatedAt,
      })
      .from(aiRewriteTasks)
      .where(inArray(aiRewriteTasks.status, ["pending", "running"]))
      .orderBy(desc(aiRewriteTasks.updatedAt), desc(aiRewriteTasks.createdAt))
      .limit(40),
    db
      .select({
        id: imageCoverGenerationTasks.id,
        postId: imageCoverGenerationTasks.postId,
        title: imageCoverGenerationTasks.title,
        status: imageCoverGenerationTasks.status,
        startedAt: imageCoverGenerationTasks.startedAt,
        createdAt: imageCoverGenerationTasks.createdAt,
        updatedAt: imageCoverGenerationTasks.updatedAt,
      })
      .from(imageCoverGenerationTasks)
      .where(inArray(imageCoverGenerationTasks.status, ["pending", "running"]))
      .orderBy(
        desc(imageCoverGenerationTasks.updatedAt),
        desc(imageCoverGenerationTasks.createdAt),
      )
      .limit(40),
    db
      .select({
        id: serverOfferImportTasks.id,
        postId: serverOfferImportTasks.postId,
        mode: serverOfferImportTasks.mode,
        status: serverOfferImportTasks.status,
        startedAt: serverOfferImportTasks.startedAt,
        createdAt: serverOfferImportTasks.createdAt,
        updatedAt: serverOfferImportTasks.updatedAt,
      })
      .from(serverOfferImportTasks)
      .where(inArray(serverOfferImportTasks.status, ["pending", "running"]))
      .orderBy(
        desc(serverOfferImportTasks.updatedAt),
        desc(serverOfferImportTasks.createdAt),
      )
      .limit(40),
    getAdminBackgroundJobSnapshots(),
  ]);

  const recentFailures: RecentFailure[] = [
    ...aiFailures.map((task) => ({
      source: "ai" as const,
      id: task.id,
      title: taskTitle(task.resultTitle, task.sourceTitle, task.sourceUrl),
      status: task.status,
      message: failureMessage(task.error),
      href: `/ai-tasks/${task.id}`,
      createdAt: serializeDate(task.createdAt),
      updatedAt: serializeDate(task.updatedAt),
    })),
    ...coverFailures.map((task) => ({
      source: "cover" as const,
      id: task.id,
      title: taskTitle(task.title, `文章 #${task.postId}`),
      status: task.status,
      message: failureMessage(task.errorTitle, task.errorDetail),
      href: "/images/covers",
      createdAt: serializeDate(task.createdAt),
      updatedAt: serializeDate(task.updatedAt),
    })),
    ...offerFailures.map((task) => ({
      source: "offer" as const,
      id: task.id,
      title:
        task.mode === "single"
          ? taskTitle(task.message, task.postId ? `文章 #${task.postId}` : null)
          : "历史文章套餐提取",
      status: task.status,
      message: failureMessage(task.errorTitle, task.errorDetail),
      href: task.postId ? `/posts/edit` : "/servers",
      createdAt: serializeDate(task.createdAt),
      updatedAt: serializeDate(task.updatedAt),
    })),
  ]
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt ?? left.createdAt ?? "");
      const rightTime = Date.parse(right.updatedAt ?? right.createdAt ?? "");
      return (
        (Number.isNaN(rightTime) ? 0 : rightTime) -
        (Number.isNaN(leftTime) ? 0 : leftTime)
      );
    })
    .slice(0, 8);

  const staleTasks = [
    ...aiActiveTasks.map((task) =>
      activeTaskRowToStaleTask({
        source: "ai",
        id: task.id,
        title: taskTitle(task.resultTitle, task.sourceTitle, task.sourceUrl),
        status: task.status,
        href: `/ai-tasks/${task.id}`,
        updatedAt: task.updatedAt,
        startedAt: task.startedAt,
        createdAt: task.createdAt,
      }),
    ),
    ...coverActiveTasks.map((task) =>
      activeTaskRowToStaleTask({
        source: "cover",
        id: task.id,
        title: taskTitle(task.title, `文章 #${task.postId}`),
        status: task.status,
        href: "/images/covers",
        updatedAt: task.updatedAt,
        startedAt: task.startedAt,
        createdAt: task.createdAt,
      }),
    ),
    ...offerActiveTasks.map((task) =>
      activeTaskRowToStaleTask({
        source: "offer",
        id: task.id,
        title:
          task.mode === "single"
            ? taskTitle(task.postId ? `文章 #${task.postId}` : null)
            : "历史文章套餐提取",
        status: task.status,
        href: task.postId ? "/servers/manage" : "/servers",
        updatedAt: task.updatedAt,
        startedAt: task.startedAt,
        createdAt: task.createdAt,
      }),
    ),
  ]
    .filter((task) => task.ageMinutes !== null && task.ageMinutes >= 15)
    .sort((left, right) => (right.ageMinutes ?? 0) - (left.ageMinutes ?? 0))
    .slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    runtime: getAdminRuntimeSnapshot(),
    backgroundWorker: getAdminBackgroundWorkerRuntimeSnapshot(),
    queues: {
      ai: toStatusSummary(aiStatusRows),
      cover: toStatusSummary(coverStatusRows),
      offer: toStatusSummary(offerStatusRows),
    },
    backgroundJobs,
    recentFailures,
    staleTasks,
  };
}

export type CmsTaskOperationsSummary = Awaited<
  ReturnType<typeof getCmsTaskOperationsSummary>
>;

function parseOfferImportResult(value: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as {
      scannedPosts?: number;
      extracted?: number;
      inserted?: number;
      updated?: number;
      skipped?: number;
    };

    return {
      scannedPosts: Number(parsed.scannedPosts) || 0,
      extracted: Number(parsed.extracted) || 0,
      inserted: Number(parsed.inserted) || 0,
      updated: Number(parsed.updated) || 0,
      skipped: Number(parsed.skipped) || 0,
    };
  } catch {
    return null;
  }
}

function postSummary(row: {
  postId: number | null;
  postTitle: string | null;
  postSlug: string | null;
  postLanguage: string | null;
}) {
  if (!row.postId || !row.postSlug || !row.postTitle) return null;

  return {
    id: row.postId,
    title: row.postTitle,
    slug: row.postSlug,
    language: row.postLanguage ?? "zh",
  };
}

function coverTaskDescription(row: {
  batchId: string;
  outputUrl: string | null;
  postTitle: string | null;
  errorTitle: string | null;
  errorDetail: string | null;
}) {
  if (row.errorTitle || row.errorDetail) {
    return failureMessage(row.errorTitle, row.errorDetail);
  }

  if (row.outputUrl) {
    return `已生成封面：${row.outputUrl}`;
  }

  return row.postTitle
    ? `为文章「${row.postTitle}」生成封面`
    : `封面批次 ${row.batchId}`;
}

function offerTaskDescription(row: {
  mode: string;
  message: string | null;
  result: string | null;
  errorTitle: string | null;
  errorDetail: string | null;
}) {
  if (row.errorTitle || row.errorDetail) {
    return failureMessage(row.errorTitle, row.errorDetail);
  }

  const result = parseOfferImportResult(row.result);
  if (result) {
    return `扫描 ${result.scannedPosts} 篇，提取 ${result.extracted} 条，新增 ${result.inserted} 条，更新 ${result.updated} 条`;
  }

  return (
    row.message ??
    (row.mode === "bulk" ? "历史文章套餐提取" : "单篇文章套餐提取")
  );
}

export async function getUnifiedTaskList(filtersInput: UnifiedTaskListFilters) {
  await requireAdminSession();

  const filters = normalizeUnifiedTaskListFilters(filtersInput);
  const shouldReadAi = filters.type === "all" || filters.type === "ai";
  const shouldReadCover = filters.type === "all" || filters.type === "cover";
  const shouldReadOffer = filters.type === "all" || filters.type === "offer";
  const readLimit = filters.offset + filters.pageSize;
  const aiWhere = andMaybe(
    statusConditions(aiRewriteTasks.status, filters.status),
    filters.query
      ? or(
          ilikeContains(aiRewriteTasks.sourceUrl, filters.query),
          ilikeContains(aiRewriteTasks.sourceTitle, filters.query),
          ilikeContains(aiRewriteTasks.resultTitle, filters.query),
          ilikeContains(aiRewriteTasks.error, filters.query),
          ilikeContains(posts.title, filters.query),
          ilikeContains(posts.slug, filters.query),
        )
      : undefined,
  );
  const coverWhere = andMaybe(
    statusConditions(imageCoverGenerationTasks.status, filters.status),
    filters.query
      ? or(
          ilikeContains(imageCoverGenerationTasks.title, filters.query),
          ilikeContains(imageCoverGenerationTasks.batchId, filters.query),
          ilikeContains(imageCoverGenerationTasks.errorTitle, filters.query),
          ilikeContains(imageCoverGenerationTasks.errorDetail, filters.query),
          ilikeContains(posts.title, filters.query),
          ilikeContains(posts.slug, filters.query),
        )
      : undefined,
  );
  const offerWhere = andMaybe(
    statusConditions(serverOfferImportTasks.status, filters.status),
    filters.query
      ? or(
          ilikeContains(serverOfferImportTasks.mode, filters.query),
          ilikeContains(serverOfferImportTasks.message, filters.query),
          ilikeContains(serverOfferImportTasks.errorTitle, filters.query),
          ilikeContains(serverOfferImportTasks.errorDetail, filters.query),
          ilikeContains(posts.title, filters.query),
          ilikeContains(posts.slug, filters.query),
        )
      : undefined,
  );

  const [
    aiRows,
    coverRows,
    offerRows,
    aiCountRows,
    coverCountRows,
    offerCountRows,
  ] = await Promise.all([
    shouldReadAi
      ? db
          .select({
            id: aiRewriteTasks.id,
            sourceType: aiRewriteTasks.sourceType,
            sourceUrl: aiRewriteTasks.sourceUrl,
            sourceTitle: aiRewriteTasks.sourceTitle,
            resultTitle: aiRewriteTasks.resultTitle,
            status: aiRewriteTasks.status,
            progress: aiRewriteTasks.progress,
            currentStep: aiRewriteTasks.currentStep,
            error: aiRewriteTasks.error,
            postId: posts.id,
            postTitle: posts.title,
            postSlug: posts.slug,
            postLanguage: posts.language,
            createdAt: aiRewriteTasks.createdAt,
            updatedAt: aiRewriteTasks.updatedAt,
            startedAt: aiRewriteTasks.startedAt,
            finishedAt: aiRewriteTasks.finishedAt,
          })
          .from(aiRewriteTasks)
          .leftJoin(posts, eq(aiRewriteTasks.postId, posts.id))
          .where(aiWhere)
          .orderBy(
            desc(
              sql`coalesce(${aiRewriteTasks.updatedAt}, ${aiRewriteTasks.createdAt})`,
            ),
            desc(aiRewriteTasks.id),
          )
          .limit(readLimit)
      : [],
    shouldReadCover
      ? db
          .select({
            id: imageCoverGenerationTasks.id,
            batchId: imageCoverGenerationTasks.batchId,
            title: imageCoverGenerationTasks.title,
            status: imageCoverGenerationTasks.status,
            outputUrl: imageCoverGenerationTasks.outputUrl,
            errorTitle: imageCoverGenerationTasks.errorTitle,
            errorDetail: imageCoverGenerationTasks.errorDetail,
            postId: posts.id,
            postTitle: posts.title,
            postSlug: posts.slug,
            postLanguage: posts.language,
            createdAt: imageCoverGenerationTasks.createdAt,
            updatedAt: imageCoverGenerationTasks.updatedAt,
            startedAt: imageCoverGenerationTasks.startedAt,
            finishedAt: imageCoverGenerationTasks.finishedAt,
          })
          .from(imageCoverGenerationTasks)
          .leftJoin(posts, eq(imageCoverGenerationTasks.postId, posts.id))
          .where(coverWhere)
          .orderBy(
            desc(
              sql`coalesce(${imageCoverGenerationTasks.updatedAt}, ${imageCoverGenerationTasks.createdAt})`,
            ),
            desc(imageCoverGenerationTasks.id),
          )
          .limit(readLimit)
      : [],
    shouldReadOffer
      ? db
          .select({
            id: serverOfferImportTasks.id,
            mode: serverOfferImportTasks.mode,
            status: serverOfferImportTasks.status,
            progress: serverOfferImportTasks.progress,
            message: serverOfferImportTasks.message,
            result: serverOfferImportTasks.result,
            errorTitle: serverOfferImportTasks.errorTitle,
            errorDetail: serverOfferImportTasks.errorDetail,
            postId: posts.id,
            postTitle: posts.title,
            postSlug: posts.slug,
            postLanguage: posts.language,
            createdAt: serverOfferImportTasks.createdAt,
            updatedAt: serverOfferImportTasks.updatedAt,
            startedAt: serverOfferImportTasks.startedAt,
            finishedAt: serverOfferImportTasks.finishedAt,
          })
          .from(serverOfferImportTasks)
          .leftJoin(posts, eq(serverOfferImportTasks.postId, posts.id))
          .where(offerWhere)
          .orderBy(
            desc(
              sql`coalesce(${serverOfferImportTasks.updatedAt}, ${serverOfferImportTasks.createdAt})`,
            ),
            desc(serverOfferImportTasks.id),
          )
          .limit(readLimit)
      : [],
    shouldReadAi
      ? db
          .select({ value: count() })
          .from(aiRewriteTasks)
          .leftJoin(posts, eq(aiRewriteTasks.postId, posts.id))
          .where(aiWhere)
      : [],
    shouldReadCover
      ? db
          .select({ value: count() })
          .from(imageCoverGenerationTasks)
          .leftJoin(posts, eq(imageCoverGenerationTasks.postId, posts.id))
          .where(coverWhere)
      : [],
    shouldReadOffer
      ? db
          .select({ value: count() })
          .from(serverOfferImportTasks)
          .leftJoin(posts, eq(serverOfferImportTasks.postId, posts.id))
          .where(offerWhere)
      : [],
  ]);

  const items: UnifiedTaskListItem[] = [
    ...aiRows.map((task) => ({
      uid: `ai-${task.id}`,
      type: "ai" as const,
      id: task.id,
      title: taskTitle(task.resultTitle, task.sourceTitle, task.sourceUrl),
      status: task.status,
      progress: serializeProgress(task.progress, task.status),
      description: task.error ?? task.currentStep ?? "等待处理",
      error: task.error,
      href: `/ai-tasks/${task.id}`,
      sourceLabel: task.sourceType,
      post: postSummary(task),
      createdAt: serializeDate(task.createdAt),
      updatedAt: serializeDate(task.updatedAt),
      startedAt: serializeDate(task.startedAt),
      finishedAt: serializeDate(task.finishedAt),
      canRetry: task.status === "failed" || task.status === "cancelled",
      canCancel: task.status === "pending",
      canResolve: task.status === "manual_required",
    })),
    ...coverRows.map((task) => ({
      uid: `cover-${task.id}`,
      type: "cover" as const,
      id: task.id,
      title: task.title,
      status: task.status,
      progress: serializeProgress(null, task.status),
      description: coverTaskDescription(task),
      error:
        task.errorTitle || task.errorDetail
          ? failureMessage(task.errorTitle, task.errorDetail)
          : null,
      href: `/ai-tasks/covers/${task.id}`,
      sourceLabel: "cover",
      post: postSummary(task),
      createdAt: serializeDate(task.createdAt),
      updatedAt: serializeDate(task.updatedAt),
      startedAt: serializeDate(task.startedAt),
      finishedAt: serializeDate(task.finishedAt),
      canRetry: task.status === "failed" || task.status === "cancelled",
      canCancel: task.status === "pending",
      canResolve: false,
    })),
    ...offerRows.map((task) => ({
      uid: `offer-${task.id}`,
      type: "offer" as const,
      id: task.id,
      title:
        task.mode === "bulk"
          ? "历史文章套餐提取"
          : task.postTitle
            ? `提取套餐：${task.postTitle}`
            : "单篇文章套餐提取",
      status: task.status,
      progress: serializeProgress(task.progress, task.status),
      description: offerTaskDescription(task),
      error:
        task.errorTitle || task.errorDetail
          ? failureMessage(task.errorTitle, task.errorDetail)
          : null,
      href: `/ai-tasks/offers/${task.id}`,
      sourceLabel: task.mode,
      post: postSummary(task),
      createdAt: serializeDate(task.createdAt),
      updatedAt: serializeDate(task.updatedAt),
      startedAt: serializeDate(task.startedAt),
      finishedAt: serializeDate(task.finishedAt),
      canRetry: task.status === "failed" || task.status === "cancelled",
      canCancel: task.status === "pending",
      canResolve: false,
    })),
  ].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt ?? left.createdAt ?? "");
    const rightTime = Date.parse(right.updatedAt ?? right.createdAt ?? "");
    return (
      (Number.isNaN(rightTime) ? 0 : rightTime) -
      (Number.isNaN(leftTime) ? 0 : leftTime)
    );
  });
  const totalCount =
    (aiCountRows[0]?.value ?? 0) +
    (coverCountRows[0]?.value ?? 0) +
    (offerCountRows[0]?.value ?? 0);

  return {
    filters,
    totalCount,
    totalPage: Math.max(1, Math.ceil(totalCount / filters.pageSize)),
    items: items.slice(filters.offset, filters.offset + filters.pageSize),
  };
}

export type UnifiedTaskListResult = Awaited<
  ReturnType<typeof getUnifiedTaskList>
>;

export async function getCoverTaskDetail(taskId: number) {
  await requireAdminSession();

  const [task] = await db
    .select({
      id: imageCoverGenerationTasks.id,
      batchId: imageCoverGenerationTasks.batchId,
      postId: imageCoverGenerationTasks.postId,
      title: imageCoverGenerationTasks.title,
      configId: imageCoverGenerationTasks.configId,
      configName: imageCoverGenerationTasks.configName,
      provider: imageCoverGenerationTasks.provider,
      model: imageCoverGenerationTasks.model,
      status: imageCoverGenerationTasks.status,
      outputUrl: imageCoverGenerationTasks.outputUrl,
      errorTitle: imageCoverGenerationTasks.errorTitle,
      errorDetail: imageCoverGenerationTasks.errorDetail,
      assetId: imageCoverGenerationTasks.assetId,
      assetPath: imageAssets.path,
      assetThumbPath: imageAssets.thumbPath,
      assetWidth: imageAssets.width,
      assetHeight: imageAssets.height,
      assetPrompt: imageAssets.prompt,
      postTitle: posts.title,
      postSlug: posts.slug,
      postLanguage: posts.language,
      postImgUrl: posts.imgUrl,
      createdAt: imageCoverGenerationTasks.createdAt,
      updatedAt: imageCoverGenerationTasks.updatedAt,
      startedAt: imageCoverGenerationTasks.startedAt,
      finishedAt: imageCoverGenerationTasks.finishedAt,
    })
    .from(imageCoverGenerationTasks)
    .leftJoin(posts, eq(imageCoverGenerationTasks.postId, posts.id))
    .leftJoin(
      imageAssets,
      eq(imageCoverGenerationTasks.assetId, imageAssets.id),
    )
    .where(eq(imageCoverGenerationTasks.id, taskId))
    .limit(1);

  if (!task) return null;

  const steps: UnifiedTaskStep[] = [
    {
      key: "created",
      name: "创建任务",
      status: "success",
      description: `批次 ${task.batchId}`,
      time: serializeDate(task.createdAt),
    },
    {
      key: "queued",
      name: "进入队列",
      status:
        task.status === "pending"
          ? "running"
          : task.status === "cancelled"
            ? "cancelled"
            : "success",
      description:
        task.status === "pending"
          ? "等待封面生成 worker 领取"
          : "已离开排队状态",
      time: serializeDate(task.updatedAt ?? task.createdAt),
    },
    {
      key: "config",
      name: "绑定生图配置",
      status: task.configId ? "success" : "pending",
      description: task.configId
        ? `${task.configName ?? `配置 #${task.configId}`} / ${task.model ?? "未记录模型"}`
        : "等待 worker 为旧任务绑定当前默认配置",
      time: serializeDate(task.startedAt ?? task.updatedAt),
    },
    {
      key: "generate",
      name: "生成封面",
      status: stepStatusForTask(task.status),
      description:
        task.status === "failed"
          ? failureMessage(task.errorTitle, task.errorDetail)
          : task.outputUrl
            ? `输出 ${task.outputUrl}`
            : "等待调用生图接口",
      time: serializeDate(task.finishedAt ?? task.updatedAt),
      payload: task.assetPrompt,
    },
    {
      key: "write-post",
      name: "写回文章封面",
      status:
        task.outputUrl && task.postImgUrl === task.outputUrl
          ? "success"
          : "pending",
      description:
        task.outputUrl && task.postImgUrl === task.outputUrl
          ? "封面已写入文章 imgUrl"
          : "生成成功后写回文章封面字段",
      time: serializeDate(task.finishedAt),
    },
  ];

  return {
    ...task,
    description: coverTaskDescription(task),
    error:
      task.errorTitle || task.errorDetail
        ? failureMessage(task.errorTitle, task.errorDetail)
        : null,
    post: postSummary({
      postId: task.postId,
      postTitle: task.postTitle,
      postSlug: task.postSlug,
      postLanguage: task.postLanguage,
    }),
    asset: task.assetId
      ? {
          id: task.assetId,
          path: task.assetPath,
          thumbPath: task.assetThumbPath,
          width: task.assetWidth,
          height: task.assetHeight,
          prompt: task.assetPrompt,
        }
      : null,
    steps,
    createdAt: serializeDate(task.createdAt),
    updatedAt: serializeDate(task.updatedAt),
    startedAt: serializeDate(task.startedAt),
    finishedAt: serializeDate(task.finishedAt),
    canRetry: task.status === "failed" || task.status === "cancelled",
    canCancel: task.status === "pending",
  };
}

export type CoverTaskDetail = NonNullable<
  Awaited<ReturnType<typeof getCoverTaskDetail>>
>;

export async function getOfferTaskDetail(taskId: number) {
  await requireAdminSession();

  const [task] = await db
    .select({
      id: serverOfferImportTasks.id,
      mode: serverOfferImportTasks.mode,
      postId: serverOfferImportTasks.postId,
      status: serverOfferImportTasks.status,
      progress: serverOfferImportTasks.progress,
      message: serverOfferImportTasks.message,
      result: serverOfferImportTasks.result,
      errorTitle: serverOfferImportTasks.errorTitle,
      errorDetail: serverOfferImportTasks.errorDetail,
      postTitle: posts.title,
      postSlug: posts.slug,
      postLanguage: posts.language,
      createdAt: serverOfferImportTasks.createdAt,
      updatedAt: serverOfferImportTasks.updatedAt,
      startedAt: serverOfferImportTasks.startedAt,
      finishedAt: serverOfferImportTasks.finishedAt,
    })
    .from(serverOfferImportTasks)
    .leftJoin(posts, eq(serverOfferImportTasks.postId, posts.id))
    .where(eq(serverOfferImportTasks.id, taskId))
    .limit(1);

  if (!task) return null;

  const result = parseOfferImportResult(task.result);
  const steps: UnifiedTaskStep[] = [
    {
      key: "created",
      name: "创建任务",
      status: "success",
      description: task.mode === "bulk" ? "历史文章批量提取" : "单篇文章提取",
      time: serializeDate(task.createdAt),
    },
    {
      key: "queued",
      name: "进入队列",
      status:
        task.status === "pending"
          ? "running"
          : task.status === "cancelled"
            ? "cancelled"
            : "success",
      description:
        task.status === "pending"
          ? "等待套餐提取 worker 领取"
          : (task.message ?? "已离开排队状态"),
      time: serializeDate(task.updatedAt ?? task.createdAt),
    },
    {
      key: "extract",
      name: "识别配置、价格和购买链接",
      status: stepStatusForTask(task.status),
      description:
        task.status === "failed"
          ? failureMessage(task.errorTitle, task.errorDetail)
          : (task.message ?? "等待识别文章表格或正文段落里的有效套餐"),
      time: serializeDate(task.finishedAt ?? task.updatedAt),
    },
    {
      key: "write-offers",
      name: "写入套餐库",
      status: result
        ? "success"
        : terminalStatus(task.status)
          ? "failed"
          : "pending",
      description: result
        ? `提取有效套餐 ${result.extracted} 条，新增 ${result.inserted} 条，更新 ${result.updated} 条，跳过 ${result.skipped} 条`
        : "解析成功后写入服务器套餐库",
      time: serializeDate(task.finishedAt),
      payload: task.result,
    },
  ];

  return {
    ...task,
    progress: serializeProgress(task.progress, task.status),
    title:
      task.mode === "bulk"
        ? "历史文章套餐提取"
        : task.postTitle
          ? `提取套餐：${task.postTitle}`
          : "单篇文章套餐提取",
    description: offerTaskDescription(task),
    error:
      task.errorTitle || task.errorDetail
        ? failureMessage(task.errorTitle, task.errorDetail)
        : null,
    result,
    post: postSummary({
      postId: task.postId,
      postTitle: task.postTitle,
      postSlug: task.postSlug,
      postLanguage: task.postLanguage,
    }),
    steps,
    createdAt: serializeDate(task.createdAt),
    updatedAt: serializeDate(task.updatedAt),
    startedAt: serializeDate(task.startedAt),
    finishedAt: serializeDate(task.finishedAt),
    canRetry: task.status === "failed" || task.status === "cancelled",
    canCancel: task.status === "pending",
  };
}

export type OfferTaskDetail = NonNullable<
  Awaited<ReturnType<typeof getOfferTaskDetail>>
>;
