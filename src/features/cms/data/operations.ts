import { count, desc, eq, inArray } from "drizzle-orm";

import { requireAdminSession } from "@fwqgo/auth/session";
import { db } from "@fwqgo/db";
import {
  aiRewriteTasks,
  imageCoverGenerationTasks,
  serverOfferImportTasks,
} from "@fwqgo/db/schema";
import { getAdminBackgroundJobSnapshots } from "@/server/admin/background-jobs";

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
    queues: {
      ai: toStatusSummary(aiStatusRows),
      cover: toStatusSummary(coverStatusRows),
      offer: toStatusSummary(offerStatusRows),
    },
    backgroundJobs: getAdminBackgroundJobSnapshots(),
    recentFailures,
    staleTasks,
  };
}

export type CmsTaskOperationsSummary = Awaited<
  ReturnType<typeof getCmsTaskOperationsSummary>
>;
