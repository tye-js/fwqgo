import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { aiRewriteTasks, aiTaskSteps } from "@fwqgo/db/schema";

type DerivedTaskConfigSnapshot = {
  id: number | null;
  name: string | null;
  provider: string | null;
  model: string | null;
  maxTokens: number | null;
};

type DerivedImageConfigSnapshot = Omit<
  DerivedTaskConfigSnapshot,
  "maxTokens"
>;

export async function upsertDerivedAiTask(input: {
  sourceUrl: string;
  sourceType: "english" | "seo";
  sourceTitle: string;
  sourceContent: string;
  categoryId: number;
  initialPostId: number;
  currentStep: string;
  rewriteConfig: DerivedTaskConfigSnapshot;
  imageConfig?: DerivedImageConfigSnapshot | null;
  clearStepsOnReuse?: boolean;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.sourceUrl}, 0))`,
    );

    const taskIdentity = and(
      eq(aiRewriteTasks.sourceType, input.sourceType),
      eq(aiRewriteTasks.sourceUrl, input.sourceUrl),
    );
    const [activeTask] = await tx
      .select({ id: aiRewriteTasks.id, status: aiRewriteTasks.status })
      .from(aiRewriteTasks)
      .where(
        and(
          taskIdentity,
          inArray(aiRewriteTasks.status, ["pending", "running"]),
        ),
      )
      .orderBy(desc(aiRewriteTasks.id))
      .for("update")
      .limit(1);
    const [latestTerminalTask] = activeTask
      ? []
      : await tx
          .select({ id: aiRewriteTasks.id, status: aiRewriteTasks.status })
          .from(aiRewriteTasks)
          .where(taskIdentity)
          .orderBy(desc(aiRewriteTasks.id))
          .for("update")
          .limit(1);
    const existing = activeTask ?? latestTerminalTask;

    if (existing?.status === "running") {
      return { id: existing.id, status: "running" as const, reused: true };
    }

    const taskValues = {
      sourceTitle: input.sourceTitle,
      sourceContent: input.sourceContent,
      sourceType: input.sourceType,
      status: "pending",
      progress: 0,
      currentStep: input.currentStep,
      error: null,
      categoryId: input.categoryId,
      rewriteStyleId: input.rewriteConfig.id,
      rewriteConfigName: input.rewriteConfig.name,
      rewriteProvider: input.rewriteConfig.provider,
      rewriteModel: input.rewriteConfig.model,
      rewriteMaxTokens: input.rewriteConfig.maxTokens,
      imageConfigId: input.imageConfig?.id ?? null,
      imageConfigName: input.imageConfig?.name ?? null,
      imageProvider: input.imageConfig?.provider ?? null,
      imageModel: input.imageConfig?.model ?? null,
      resultTitle: input.sourceTitle,
      scrapedTitle: input.sourceTitle,
      scrapedDescription: null,
      scrapedHtml: input.sourceContent,
      aiInputLength: null,
      rewriteOutputLength: null,
      diagnostics: null,
      startedAt: null,
      finishedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      updatedAt: new Date(),
    } satisfies Partial<typeof aiRewriteTasks.$inferInsert>;

    if (existing) {
      const [reusedTask] = await tx
        .update(aiRewriteTasks)
        .set(taskValues)
        .where(
          and(
            eq(aiRewriteTasks.id, existing.id),
            ne(aiRewriteTasks.status, "running"),
          ),
        )
        .returning({ id: aiRewriteTasks.id });

      if (!reusedTask) {
        throw new Error("派生 AI 任务状态已变化，请刷新后重试");
      }
      if (input.clearStepsOnReuse) {
        await tx.delete(aiTaskSteps).where(eq(aiTaskSteps.taskId, reusedTask.id));
      }

      return { id: reusedTask.id, status: "pending" as const, reused: true };
    }

    const [task] = await tx
      .insert(aiRewriteTasks)
      .values({
        ...taskValues,
        sourceMaterialId: null,
        sourceUrl: input.sourceUrl,
        postId: input.initialPostId,
      })
      .returning({ id: aiRewriteTasks.id });

    if (!task) {
      throw new Error("派生 AI 任务创建失败");
    }

    return { id: task.id, status: "pending" as const, reused: false };
  });
}
