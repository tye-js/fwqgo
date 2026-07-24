"use server";

import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { getActiveAiRewriteConfig } from "@fwqgo/ai/rewrite-config";
import {
  boundOffsetPaginationByTotal,
  normalizeOffsetPagination,
} from "@fwqgo/core/pagination";
import {
  formPostgresIntegerIdSchema,
  postgresIntegerIdSchema,
} from "@fwqgo/core/postgres-id";
import { enqueueAiRewriteTask } from "@/server/ai/rewrite-task-runner";
import { getActiveImageGenerationConfig } from "@/server/images/generation-config";
import { db } from "@fwqgo/db";
import {
  aiRewriteConfigs,
  aiRewriteArtifacts,
  aiTaskSteps,
  aiRewriteTasks,
  categories,
  posts,
  sourceMaterials,
} from "@fwqgo/db/schema";
import {
  aiRewriteTaskSourceTypeFilters,
  aiRewriteTaskStatusFilters,
  type AiRewriteTaskListFilters,
} from "@/features/cms/lib/ai-rewrite-task-filters";
import { ilikeContains } from "@/server/db/search";

const taskInputSchema = z.object({
  sourceUrl: z.string().url("请输入有效 URL"),
  categoryId: formPostgresIntegerIdSchema,
  rewriteStyleId: formPostgresIntegerIdSchema.optional(),
});

const manualTaskInputSchema = z.object({
  sourceType: z.enum(["text", "email"]),
  sourceTitle: z.string().trim().min(1, "请输入素材标题").max(180),
  sourceContent: z.string().trim().min(20, "素材内容至少需要 20 个字符"),
  categoryId: formPostgresIntegerIdSchema,
  rewriteStyleId: formPostgresIntegerIdSchema.optional(),
});

const fileTaskInputSchema = z.object({
  sourceTitle: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value : undefined),
    z.string().trim().max(180).optional(),
  ),
  sourceContent: z.string().trim().min(20, "文件内容至少需要 20 个字符"),
  sourceFileName: z.string().trim().min(1, "文件名不能为空").max(260),
  sourceFileType: z.string().trim().max(120).optional(),
  sourceFileSize: z
    .number()
    .int()
    .nonnegative()
    .max(2 * 1024 * 1024),
  categoryId: formPostgresIntegerIdSchema,
  rewriteStyleId: formPostgresIntegerIdSchema.optional(),
});

function parseSourceUrls(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return [];
  }

  return [
    ...new Set(
      value
        .split(/\r?\n|,|\s+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "输入信息不正确";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "未知错误";
}

function revalidateAiTaskPages(taskId?: number) {
  revalidatePath("/ai-rewrite/tasks");
  revalidatePath("/ai-tasks");

  if (taskId) {
    revalidatePath(`/ai-rewrite/tasks/${taskId}`);
    revalidatePath(`/ai-tasks/${taskId}`);
  }
}

function parseIntegerId(value: number) {
  const parsed = postgresIntegerIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeAiRewriteTaskListFilters(
  filters: AiRewriteTaskListFilters = {},
) {
  const pagination = normalizeOffsetPagination({
    pageNo: filters.pageNo,
    pageSize: filters.pageSize,
  });
  const status = aiRewriteTaskStatusFilters.includes(
    filters.status as (typeof aiRewriteTaskStatusFilters)[number],
  )
    ? filters.status
    : "all";
  const sourceType = aiRewriteTaskSourceTypeFilters.includes(
    filters.sourceType as (typeof aiRewriteTaskSourceTypeFilters)[number],
  )
    ? filters.sourceType
    : "all";
  const language =
    filters.language === "zh" || filters.language === "en"
      ? filters.language
      : "all";

  return {
    ...pagination,
    status,
    sourceType,
    language,
    query: filters.query?.trim().slice(0, 160) ?? "",
  };
}

function getAiRewriteTaskWhereConditions(
  filters: ReturnType<typeof normalizeAiRewriteTaskListFilters>,
) {
  const conditions: SQL[] = [];
  const status = filters.status;
  const sourceType = filters.sourceType;

  if (status && status !== "all") {
    conditions.push(eq(aiRewriteTasks.status, status));
  }

  if (sourceType && sourceType !== "all") {
    conditions.push(eq(aiRewriteTasks.sourceType, sourceType));
  }

  if (filters.language === "en") {
    conditions.push(
      or(eq(posts.language, "en"), eq(aiRewriteTasks.sourceType, "english"))!,
    );
  } else if (filters.language === "zh") {
    conditions.push(
      or(
        eq(posts.language, "zh"),
        and(isNull(posts.language), ne(aiRewriteTasks.sourceType, "english")),
      )!,
    );
  }

  if (filters.query) {
    conditions.push(
      or(
        ilikeContains(aiRewriteTasks.sourceUrl, filters.query),
        ilikeContains(aiRewriteTasks.sourceTitle, filters.query),
        ilikeContains(aiRewriteTasks.resultTitle, filters.query),
        ilikeContains(posts.title, filters.query),
        ilikeContains(categories.name, filters.query),
      )!,
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function englishSourceUrl(postId: number) {
  return `post://${postId}/english`;
}

function seoSourceUrl(postId: number) {
  return `post://${postId}/seo`;
}

function normalizePostIds(postIds: number[], limit = 50) {
  return [
    ...new Set(
      postIds.map(parseIntegerId).filter((id): id is number => id !== null),
    ),
  ].slice(0, limit);
}

async function validateCategoryAndStyle(input: {
  categoryId: number;
  rewriteStyleId?: number;
}) {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);

  if (!category) {
    return "分类不存在";
  }

  const config = await getActiveAiRewriteConfig(input.rewriteStyleId);
  if (!config) {
    return input.rewriteStyleId
      ? "指定的 AI 改写配置不存在或已停用"
      : "当前没有已启用的 AI 改写配置";
  }

  return null;
}

async function createSourceMaterialAndTask(input: {
  sourceType: "url" | "text" | "email" | "file";
  sourceUrl: string;
  sourceTitle?: string | null;
  sourceContent?: string | null;
  sourceFileName?: string | null;
  sourceFileType?: string | null;
  sourceFileSize?: number | null;
  categoryId: number;
  rewriteStyleId?: number | null;
  createdBy?: string | null;
  currentStep: string;
}) {
  const rewriteConfig = await getActiveAiRewriteConfig(
    input.rewriteStyleId ?? undefined,
  );
  if (!rewriteConfig) {
    throw new Error(
      input.rewriteStyleId
        ? "指定的 AI 改写配置不存在或已停用"
        : "当前没有已启用的 AI 改写配置",
    );
  }
  const imageConfig = await getActiveImageGenerationConfig();

  return db.transaction(async (tx) => {
    const [material] = await tx
      .insert(sourceMaterials)
      .values({
        materialType: input.sourceType,
        sourceUrl: input.sourceType === "url" ? input.sourceUrl : null,
        title: input.sourceTitle ?? null,
        content: input.sourceContent ?? null,
        fileName: input.sourceFileName ?? null,
        mime: input.sourceFileType ?? null,
        size: input.sourceFileSize ?? null,
        categoryId: input.categoryId,
        rewriteStyleId: rewriteConfig.id,
        status: "queued",
        createdBy: input.createdBy ?? null,
      })
      .returning({ id: sourceMaterials.id });

    if (!material) {
      throw new Error("创建来源素材失败");
    }

    const [task] = await tx
      .insert(aiRewriteTasks)
      .values({
        sourceMaterialId: material.id,
        sourceUrl: input.sourceUrl,
        sourceType: input.sourceType,
        sourceTitle: input.sourceTitle ?? null,
        sourceContent: input.sourceContent ?? null,
        sourceFileName: input.sourceFileName ?? null,
        categoryId: input.categoryId,
        rewriteStyleId: rewriteConfig.id,
        rewriteConfigName: rewriteConfig.name,
        rewriteProvider: rewriteConfig.provider,
        rewriteModel: rewriteConfig.model,
        rewriteMaxTokens: rewriteConfig.maxTokens,
        imageConfigId: imageConfig?.id ?? null,
        imageConfigName: imageConfig?.name ?? null,
        imageProvider: imageConfig?.provider ?? null,
        imageModel: imageConfig?.model ?? null,
        status: "pending",
        progress: 0,
        currentStep: input.currentStep,
      })
      .returning({ id: aiRewriteTasks.id });

    if (!task) {
      throw new Error("创建任务失败");
    }

    return task;
  });
}

async function readTextFileFromForm(fileValue: FormDataEntryValue | null) {
  if (!(fileValue instanceof File) || fileValue.size === 0) {
    return { error: "请选择要导入的文件" };
  }

  if (fileValue.size > 2 * 1024 * 1024) {
    return { error: "单个文件不能超过 2MB" };
  }

  const fileType = fileValue.type || "text/plain";
  const fileName = fileValue.name || "未命名文件";
  const isSupported =
    fileType.startsWith("text/") ||
    /\.(txt|md|markdown|html|htm|csv)$/i.test(fileName);

  if (!isSupported) {
    return { error: "当前只支持 txt、md、html、csv 等文本类文件导入" };
  }

  const sourceContent = await fileValue.text();
  return {
    data: {
      sourceContent,
      sourceFileName: fileName,
      sourceFileType: fileType,
      sourceFileSize: fileValue.size,
    },
  };
}

export async function createAiRewriteTaskAction(formData: FormData) {
  try {
    const session = await requireAdminSession();

    const sourceType = formData.get("sourceType");
    const sourceUrls = parseSourceUrls(formData.get("sourceUrls"));
    const rewriteStyleIdValue = formData.get("rewriteStyleId");
    const sharedInput = taskInputSchema.omit({ sourceUrl: true }).parse({
      categoryId: formData.get("categoryId"),
      rewriteStyleId:
        typeof rewriteStyleIdValue === "string" && rewriteStyleIdValue
          ? rewriteStyleIdValue
          : undefined,
    });

    if (sourceType === "text" || sourceType === "email") {
      const input = manualTaskInputSchema.parse({
        sourceType,
        sourceTitle: formData.get("sourceTitle"),
        sourceContent: formData.get("sourceContent"),
        categoryId: sharedInput.categoryId,
        rewriteStyleId: sharedInput.rewriteStyleId,
      });

      const validationError = await validateCategoryAndStyle(input);
      if (validationError) {
        return { error: validationError };
      }

      const task = await createSourceMaterialAndTask({
        sourceType: input.sourceType,
        sourceUrl: `manual://${input.sourceType}/${randomUUID()}`,
        sourceTitle: input.sourceTitle,
        sourceContent: input.sourceContent,
        categoryId: input.categoryId,
        rewriteStyleId: input.rewriteStyleId ?? null,
        createdBy: session.userId,
        currentStep: "手动素材已提交，等待处理",
      });

      await enqueueAiRewriteTask(task.id);
      revalidateAiTaskPages();

      return { data: task, count: 1 };
    }

    if (sourceType === "file") {
      const fileResult = await readTextFileFromForm(formData.get("sourceFile"));
      if ("error" in fileResult) {
        return { error: fileResult.error };
      }

      const input = fileTaskInputSchema.parse({
        sourceTitle: formData.get("sourceTitle") ?? undefined,
        sourceContent: fileResult.data.sourceContent,
        sourceFileName: fileResult.data.sourceFileName,
        sourceFileType: fileResult.data.sourceFileType,
        sourceFileSize: fileResult.data.sourceFileSize,
        categoryId: sharedInput.categoryId,
        rewriteStyleId: sharedInput.rewriteStyleId,
      });

      const validationError = await validateCategoryAndStyle(input);
      if (validationError) {
        return { error: validationError };
      }

      const task = await createSourceMaterialAndTask({
        sourceType: "file",
        sourceUrl: `file://${randomUUID()}/${encodeURIComponent(input.sourceFileName)}`,
        sourceTitle: input.sourceTitle ?? input.sourceFileName,
        sourceContent: input.sourceContent,
        sourceFileName: input.sourceFileName,
        sourceFileType: input.sourceFileType,
        sourceFileSize: input.sourceFileSize,
        categoryId: input.categoryId,
        rewriteStyleId: input.rewriteStyleId ?? null,
        createdBy: session.userId,
        currentStep: "文件素材已导入，等待处理",
      });

      await enqueueAiRewriteTask(task.id);
      revalidateAiTaskPages();

      return { data: task, count: 1 };
    }

    const urls =
      sourceUrls.length > 0
        ? sourceUrls
        : parseSourceUrls(formData.get("sourceUrl"));
    const parsedUrls: Array<z.infer<typeof taskInputSchema>> = [];

    for (const [index, sourceUrl] of urls.entries()) {
      const parsed = taskInputSchema.safeParse({
        sourceUrl,
        categoryId: sharedInput.categoryId,
        rewriteStyleId: sharedInput.rewriteStyleId,
      });

      if (!parsed.success) {
        return {
          error: `第 ${index + 1} 个 URL 无效：${parsed.error.issues[0]?.message ?? sourceUrl}`,
        };
      }

      parsedUrls.push(parsed.data);
    }

    if (parsedUrls.length === 0) {
      return { error: "请输入至少一个有效 URL" };
    }

    if (parsedUrls.length > 20) {
      return { error: "单次最多提交 20 个 URL" };
    }

    const validationError = await validateCategoryAndStyle(sharedInput);
    if (validationError) {
      return { error: validationError };
    }

    const tasks = [];
    for (const input of parsedUrls) {
      const task = await createSourceMaterialAndTask({
        sourceType: "url",
        sourceUrl: input.sourceUrl,
        categoryId: sharedInput.categoryId,
        rewriteStyleId: sharedInput.rewriteStyleId ?? null,
        createdBy: session.userId,
        currentStep: "等待处理",
      });
      tasks.push(task);
    }

    if (tasks.length === 0) {
      return { error: "创建任务失败" };
    }

    for (const task of tasks) {
      await enqueueAiRewriteTask(task.id);
    }
    revalidateAiTaskPages();

    return { data: tasks[0], count: tasks.length };
  } catch (error) {
    console.error("创建 AI 改写任务失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function retryAiRewriteTaskAction(taskId: number) {
  try {
    await requireAdminSession();
    const parsedTaskId = parseIntegerId(taskId);
    if (parsedTaskId === null) return { error: "任务 ID 不正确" };

    const [retryCandidate] = await db
      .select({
        status: aiRewriteTasks.status,
        rewriteStyleId: aiRewriteTasks.rewriteStyleId,
        rewriteConfigName: aiRewriteTasks.rewriteConfigName,
        rewriteProvider: aiRewriteTasks.rewriteProvider,
        rewriteModel: aiRewriteTasks.rewriteModel,
      })
      .from(aiRewriteTasks)
      .where(eq(aiRewriteTasks.id, parsedTaskId))
      .limit(1);
    if (
      !retryCandidate ||
      !["failed", "manual_required", "cancelled"].includes(
        retryCandidate.status,
      )
    ) {
      return { error: "任务不存在，或当前状态不能重试" };
    }

    const hasDeletedConfigSnapshot =
      !retryCandidate.rewriteStyleId &&
      [
        retryCandidate.rewriteConfigName,
        retryCandidate.rewriteProvider,
        retryCandidate.rewriteModel,
      ].some((value) => Boolean(value));
    const rewriteConfig = hasDeletedConfigSnapshot
      ? null
      : await getActiveAiRewriteConfig(
          retryCandidate.rewriteStyleId ?? undefined,
        );
    if (!rewriteConfig) {
      return {
        error: retryCandidate.rewriteStyleId
          ? `任务绑定的 AI 改写配置 #${retryCandidate.rewriteStyleId} 已停用或不存在，请启用原配置后重试`
          : hasDeletedConfigSnapshot
            ? "任务绑定的 AI 改写配置已被删除，请重新创建任务"
            : "当前没有可用的默认 AI 改写配置",
      };
    }

    const task = await db.transaction(async (tx) => {
      const [updatedTask] = await tx
        .update(aiRewriteTasks)
        .set({
          status: "pending",
          progress: 0,
          currentStep: "等待重试",
          error: null,
          resultTitle: null,
          scrapedTitle: null,
          scrapedDescription: null,
          scrapedHtml: null,
          aiInputLength: null,
          rewriteOutputLength: null,
          diagnostics: null,
          rewriteStyleId: rewriteConfig.id,
          rewriteConfigName: rewriteConfig.name,
          rewriteProvider: rewriteConfig.provider,
          rewriteModel: rewriteConfig.model,
          rewriteMaxTokens: rewriteConfig.maxTokens,
          updatedAt: new Date(),
          startedAt: null,
          finishedAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
        })
        .where(
          and(
            eq(aiRewriteTasks.id, parsedTaskId),
            inArray(aiRewriteTasks.status, [
              "failed",
              "manual_required",
              "cancelled",
            ]),
          ),
        )
        .returning({
          id: aiRewriteTasks.id,
          sourceMaterialId: aiRewriteTasks.sourceMaterialId,
        });

      if (!updatedTask) return null;

      await tx
        .delete(aiTaskSteps)
        .where(eq(aiTaskSteps.taskId, updatedTask.id));

      if (updatedTask.sourceMaterialId) {
        await tx
          .update(sourceMaterials)
          .set({ status: "queued", updatedAt: new Date() })
          .where(eq(sourceMaterials.id, updatedTask.sourceMaterialId));
      }

      return updatedTask;
    });

    if (!task) {
      return { error: "任务不存在，或当前状态不能重试" };
    }

    await enqueueAiRewriteTask(task.id);
    revalidateAiTaskPages(parsedTaskId);

    return { data: task };
  } catch (error) {
    console.error("重试 AI 改写任务失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function deleteAiRewriteTaskAction(taskId: number) {
  try {
    await requireAdminSession();
    const parsedTaskId = parseIntegerId(taskId);
    if (parsedTaskId === null) return { error: "任务 ID 不正确" };

    const task = await db.transaction(async (tx) => {
      const [deletedTask] = await tx
        .delete(aiRewriteTasks)
        .where(
          and(
            eq(aiRewriteTasks.id, parsedTaskId),
            ne(aiRewriteTasks.status, "running"),
          ),
        )
        .returning({
          id: aiRewriteTasks.id,
          sourceMaterialId: aiRewriteTasks.sourceMaterialId,
          postId: aiRewriteTasks.postId,
        });

      if (!deletedTask) return null;

      if (deletedTask.sourceMaterialId) {
        await tx
          .update(sourceMaterials)
          .set({
            status: "deleted",
            updatedAt: new Date(),
          })
          .where(eq(sourceMaterials.id, deletedTask.sourceMaterialId));
      }

      return deletedTask;
    });

    if (!task) {
      const [existingTask] = await db
        .select({ status: aiRewriteTasks.status })
        .from(aiRewriteTasks)
        .where(eq(aiRewriteTasks.id, parsedTaskId))
        .limit(1);

      return existingTask?.status === "running"
        ? { error: "任务正在处理中，不能删除。请等待任务结束后再删除。" }
        : { error: "任务不存在或已被删除" };
    }

    revalidateAiTaskPages(parsedTaskId);

    return {
      data: {
        id: task.id,
        postId: task.postId,
      },
    };
  } catch (error) {
    console.error("删除 AI 改写任务失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function cancelAiRewriteTaskAction(taskId: number) {
  try {
    await requireAdminSession();
    const parsedTaskId = parseIntegerId(taskId);
    if (parsedTaskId === null) return { error: "任务 ID 不正确" };

    const task = await db.transaction(async (tx) => {
      const now = new Date();
      const [updatedTask] = await tx
        .update(aiRewriteTasks)
        .set({
          status: "cancelled",
          progress: 0,
          currentStep: "任务已取消",
          error: null,
          finishedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(aiRewriteTasks.id, parsedTaskId),
            eq(aiRewriteTasks.status, "pending"),
          ),
        )
        .returning({
          id: aiRewriteTasks.id,
          sourceMaterialId: aiRewriteTasks.sourceMaterialId,
        });

      if (!updatedTask) return null;

      if (updatedTask.sourceMaterialId) {
        await tx
          .update(sourceMaterials)
          .set({ status: "cancelled", updatedAt: now })
          .where(eq(sourceMaterials.id, updatedTask.sourceMaterialId));
      }

      return updatedTask;
    });

    if (!task) {
      return {
        error: "任务不存在，或当前状态不能取消。运行中任务需要等待本轮结束。",
      };
    }

    revalidateAiTaskPages(parsedTaskId);

    return { data: task };
  } catch (error) {
    console.error("取消 AI 改写任务失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function enqueueEnglishVersionForPostAction(postId: number) {
  try {
    await requireAdminSession();
    const parsedPostId = parseIntegerId(postId);
    if (parsedPostId === null) return { error: "文章 ID 不正确" };

    const [post] = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        content: posts.content,
        categoryId: posts.categoryId,
        language: posts.language,
        translationSourcePostId: posts.translationSourcePostId,
      })
      .from(posts)
      .where(eq(posts.id, parsedPostId))
      .limit(1);

    if (!post) {
      return { error: "文章不存在或已被删除" };
    }

    const parentPost =
      post.language === "en"
        ? post.translationSourcePostId
          ? (
              await db
                .select({
                  id: posts.id,
                  title: posts.title,
                  slug: posts.slug,
                  content: posts.content,
                  categoryId: posts.categoryId,
                })
                .from(posts)
                .where(eq(posts.id, post.translationSourcePostId))
                .limit(1)
            )[0]
          : null
        : post;

    if (!parentPost) {
      return { error: "英文文章缺少对应的中文来源，无法重新生成英文" };
    }

    const sourceSnapshot = parentPost.content.trim().slice(0, 60_000);
    if (!sourceSnapshot) {
      return { error: "中文文章正文为空，无法生成英文文章" };
    }

    const sourceUrl = englishSourceUrl(parentPost.id);
    const [latestSourceTask] = await db
      .select({
        rewriteStyleId: aiRewriteTasks.rewriteStyleId,
        imageConfigId: aiRewriteTasks.imageConfigId,
      })
      .from(aiRewriteTasks)
      .where(eq(aiRewriteTasks.postId, parentPost.id))
      .orderBy(desc(aiRewriteTasks.createdAt))
      .limit(1);

    const rewriteConfig = await getActiveAiRewriteConfig(
      latestSourceTask?.rewriteStyleId ?? undefined,
    );
    if (!rewriteConfig) {
      return {
        error: latestSourceTask?.rewriteStyleId
          ? `来源任务绑定的 AI 改写配置 #${latestSourceTask.rewriteStyleId} 已停用或不存在`
          : "当前没有已启用的默认 AI 改写配置",
      };
    }
    const imageConfig = await getActiveImageGenerationConfig(
      latestSourceTask?.imageConfigId ?? undefined,
    );
    if (latestSourceTask?.imageConfigId && !imageConfig) {
      return {
        error: `来源任务绑定的生图配置 #${latestSourceTask.imageConfigId} 已停用或不存在`,
      };
    }

    const [existingTask] = await db
      .select({
        id: aiRewriteTasks.id,
        status: aiRewriteTasks.status,
      })
      .from(aiRewriteTasks)
      .where(eq(aiRewriteTasks.sourceUrl, sourceUrl))
      .orderBy(desc(aiRewriteTasks.createdAt))
      .limit(1);

    let task = existingTask
      ? existingTask.status === "running"
        ? existingTask
        : (
            await db
              .update(aiRewriteTasks)
              .set({
                sourceTitle: parentPost.title,
                sourceContent: sourceSnapshot,
                sourceType: "english",
                status: "pending",
                progress: 0,
                currentStep: "等待翻译中文改写正文并生成英文 SEO",
                error: null,
                categoryId: parentPost.categoryId,
                rewriteStyleId: rewriteConfig.id,
                rewriteConfigName: rewriteConfig.name,
                rewriteProvider: rewriteConfig.provider,
                rewriteModel: rewriteConfig.model,
                rewriteMaxTokens: rewriteConfig.maxTokens,
                imageConfigId: imageConfig?.id ?? null,
                imageConfigName: imageConfig?.name ?? null,
                imageProvider: imageConfig?.provider ?? null,
                imageModel: imageConfig?.model ?? null,
                postId: parentPost.id,
                resultTitle: parentPost.title,
                scrapedTitle: parentPost.title,
                scrapedHtml: sourceSnapshot,
                aiInputLength: null,
                rewriteOutputLength: null,
                diagnostics: null,
                startedAt: null,
                finishedAt: null,
                leaseOwner: null,
                leaseExpiresAt: null,
                heartbeatAt: null,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(aiRewriteTasks.id, existingTask.id),
                  ne(aiRewriteTasks.status, "running"),
                ),
              )
              .returning({
                id: aiRewriteTasks.id,
                status: aiRewriteTasks.status,
              })
          )[0]
      : (
          await db
            .insert(aiRewriteTasks)
            .values({
              sourceMaterialId: null,
              sourceUrl,
              sourceType: "english",
              sourceTitle: parentPost.title,
              sourceContent: sourceSnapshot,
              status: "pending",
              progress: 0,
              currentStep: "等待翻译中文改写正文并生成英文 SEO",
              categoryId: parentPost.categoryId,
              rewriteStyleId: rewriteConfig.id,
              rewriteConfigName: rewriteConfig.name,
              rewriteProvider: rewriteConfig.provider,
              rewriteModel: rewriteConfig.model,
              rewriteMaxTokens: rewriteConfig.maxTokens,
              imageConfigId: imageConfig?.id ?? null,
              imageConfigName: imageConfig?.name ?? null,
              imageProvider: imageConfig?.provider ?? null,
              imageModel: imageConfig?.model ?? null,
              postId: parentPost.id,
              resultTitle: parentPost.title,
              scrapedTitle: parentPost.title,
              scrapedHtml: sourceSnapshot,
            })
            .returning({ id: aiRewriteTasks.id, status: aiRewriteTasks.status })
        )[0];

    if (!task && existingTask) {
      [task] = await db
        .select({ id: aiRewriteTasks.id, status: aiRewriteTasks.status })
        .from(aiRewriteTasks)
        .where(eq(aiRewriteTasks.id, existingTask.id))
        .limit(1);
    }

    if (!task) {
      return { error: "英文生成任务创建失败" };
    }

    if (task.status !== "running") {
      await db.delete(aiTaskSteps).where(eq(aiTaskSteps.taskId, task.id));
      await enqueueAiRewriteTask(task.id);
    }

    revalidateAiTaskPages(task.id);
    revalidatePath(`/posts/edit/post/${encodeURIComponent(post.slug)}`);
    revalidatePath(`/posts/edit/post/${encodeURIComponent(parentPost.slug)}`);

    return {
      data: {
        taskId: task.id,
        sourcePostId: parentPost.id,
        sourceSlug: parentPost.slug,
      },
    };
  } catch (error) {
    console.error("创建英文文章生成任务失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function bulkEnqueueEnglishVersionsForPostsAction(
  postIds: number[],
) {
  try {
    await requireAdminSession();

    const validIds = normalizePostIds(postIds);
    if (validIds.length === 0) {
      return { error: "请先选择要生成英文的文章" };
    }

    const postRows = await db
      .select({
        id: posts.id,
        language: posts.language,
        translationSourcePostId: posts.translationSourcePostId,
      })
      .from(posts)
      .where(inArray(posts.id, validIds));
    const foundIds = new Set(postRows.map((post) => post.id));
    const sourceIds = new Set<number>();
    let skipped = validIds.filter((id) => !foundIds.has(id)).length;

    for (const post of postRows) {
      if (post.language === "en") {
        if (post.translationSourcePostId) {
          sourceIds.add(post.translationSourcePostId);
        } else {
          skipped += 1;
        }
        continue;
      }

      sourceIds.add(post.id);
    }

    let queued = 0;
    const errors: Array<{ postId: number; reason: string }> = [];
    const taskIds: number[] = [];

    for (const sourceId of sourceIds) {
      const result = await enqueueEnglishVersionForPostAction(sourceId);

      if (result.error) {
        errors.push({
          postId: sourceId,
          reason: result.error,
        });
        continue;
      }

      if (result.data?.taskId) {
        taskIds.push(result.data.taskId);
      }
      queued += 1;
    }

    revalidateAiTaskPages();

    return {
      data: {
        requested: validIds.length,
        queued,
        skipped,
        failed: errors.length,
        taskIds,
        errors,
      },
    };
  } catch (error) {
    console.error("批量创建英文文章任务失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function enqueueSeoUpdateForPostsAction(postIds: number[]) {
  try {
    await requireAdminSession();

    const validIds = normalizePostIds(postIds);
    if (validIds.length === 0) {
      return { error: "请先选择要更新 SEO 的文章" };
    }

    const postRows = await db
      .select({
        id: posts.id,
        title: posts.title,
        content: posts.content,
        categoryId: posts.categoryId,
      })
      .from(posts)
      .where(inArray(posts.id, validIds));
    const foundIds = new Set(postRows.map((post) => post.id));
    const defaultRewriteConfig = await getActiveAiRewriteConfig();

    let queued = 0;
    let running = 0;
    let skipped = validIds.filter((id) => !foundIds.has(id)).length;
    const taskIds: number[] = [];
    const errors: Array<{ postId: number; reason: string }> = [];

    for (const post of postRows) {
      const sourceSnapshot = post.content.trim().slice(0, 60_000);
      if (!sourceSnapshot) {
        skipped += 1;
        errors.push({ postId: post.id, reason: "文章正文为空" });
        continue;
      }

      const [latestSourceTask] = await db
        .select({
          rewriteStyleId: aiRewriteTasks.rewriteStyleId,
        })
        .from(aiRewriteTasks)
        .where(eq(aiRewriteTasks.postId, post.id))
        .orderBy(desc(aiRewriteTasks.createdAt))
        .limit(1);
      const rewriteConfig = latestSourceTask?.rewriteStyleId
        ? await getActiveAiRewriteConfig(latestSourceTask.rewriteStyleId)
        : defaultRewriteConfig;
      if (!rewriteConfig) {
        errors.push({
          postId: post.id,
          reason: latestSourceTask?.rewriteStyleId
            ? `来源任务绑定的 AI 改写配置 #${latestSourceTask.rewriteStyleId} 已停用或不存在`
            : "当前没有已启用的默认 AI 改写配置",
        });
        continue;
      }
      const sourceUrl = seoSourceUrl(post.id);
      const [existingTask] = await db
        .select({
          id: aiRewriteTasks.id,
          status: aiRewriteTasks.status,
        })
        .from(aiRewriteTasks)
        .where(eq(aiRewriteTasks.sourceUrl, sourceUrl))
        .orderBy(desc(aiRewriteTasks.createdAt))
        .limit(1);
      let task = existingTask
        ? existingTask.status === "running"
          ? existingTask
          : (
              await db
                .update(aiRewriteTasks)
                .set({
                  sourceTitle: post.title,
                  sourceContent: sourceSnapshot,
                  sourceType: "seo",
                  status: "pending",
                  progress: 0,
                  currentStep: "等待更新文章 SEO",
                  error: null,
                  categoryId: post.categoryId,
                  rewriteStyleId: rewriteConfig.id,
                  rewriteConfigName: rewriteConfig.name,
                  rewriteProvider: rewriteConfig.provider,
                  rewriteModel: rewriteConfig.model,
                  rewriteMaxTokens: rewriteConfig.maxTokens,
                  postId: post.id,
                  resultTitle: post.title,
                  scrapedTitle: post.title,
                  scrapedHtml: sourceSnapshot,
                  aiInputLength: null,
                  rewriteOutputLength: null,
                  diagnostics: null,
                  startedAt: null,
                  finishedAt: null,
                  leaseOwner: null,
                  leaseExpiresAt: null,
                  heartbeatAt: null,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(aiRewriteTasks.id, existingTask.id),
                    ne(aiRewriteTasks.status, "running"),
                  ),
                )
                .returning({
                  id: aiRewriteTasks.id,
                  status: aiRewriteTasks.status,
                })
            )[0]
        : (
            await db
              .insert(aiRewriteTasks)
              .values({
                sourceMaterialId: null,
                sourceUrl,
                sourceType: "seo",
                sourceTitle: post.title,
                sourceContent: sourceSnapshot,
                status: "pending",
                progress: 0,
                currentStep: "等待更新文章 SEO",
                categoryId: post.categoryId,
                rewriteStyleId: rewriteConfig.id,
                rewriteConfigName: rewriteConfig.name,
                rewriteProvider: rewriteConfig.provider,
                rewriteModel: rewriteConfig.model,
                rewriteMaxTokens: rewriteConfig.maxTokens,
                postId: post.id,
                resultTitle: post.title,
                scrapedTitle: post.title,
                scrapedHtml: sourceSnapshot,
              })
              .returning({
                id: aiRewriteTasks.id,
                status: aiRewriteTasks.status,
              })
          )[0];

      if (!task && existingTask) {
        [task] = await db
          .select({ id: aiRewriteTasks.id, status: aiRewriteTasks.status })
          .from(aiRewriteTasks)
          .where(eq(aiRewriteTasks.id, existingTask.id))
          .limit(1);
      }

      if (!task) {
        errors.push({ postId: post.id, reason: "SEO 任务创建失败" });
        continue;
      }

      taskIds.push(task.id);

      if (task.status === "running") {
        running += 1;
        continue;
      }

      await db.delete(aiTaskSteps).where(eq(aiTaskSteps.taskId, task.id));
      await enqueueAiRewriteTask(task.id);
      queued += 1;
    }

    revalidateAiTaskPages();

    return {
      data: {
        requested: validIds.length,
        queued,
        running,
        skipped,
        failed: errors.length,
        taskIds,
        errors,
      },
    };
  } catch (error) {
    console.error("批量创建 SEO 更新任务失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function resolveManualRequiredAiRewriteTaskAction(taskId: number) {
  try {
    await requireAdminSession();
    const parsedTaskId = parseIntegerId(taskId);
    if (parsedTaskId === null) return { error: "任务 ID 不正确" };

    const [task] = await db
      .select({
        id: aiRewriteTasks.id,
        status: aiRewriteTasks.status,
        postId: aiRewriteTasks.postId,
        sourceMaterialId: aiRewriteTasks.sourceMaterialId,
      })
      .from(aiRewriteTasks)
      .where(eq(aiRewriteTasks.id, parsedTaskId))
      .limit(1);

    if (!task) {
      return { error: "任务不存在" };
    }

    if (task.status !== "manual_required") {
      return { error: "只有需人工处理的任务才能标记完成" };
    }

    if (!task.postId) {
      return { error: "任务还没有生成草稿，不能标记完成" };
    }

    const updated = await db.transaction(async (tx) => {
      const now = new Date();
      const [updatedTask] = await tx
        .update(aiRewriteTasks)
        .set({
          status: "succeeded",
          progress: 100,
          currentStep: "人工审核已完成",
          error: null,
          finishedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(aiRewriteTasks.id, parsedTaskId),
            eq(aiRewriteTasks.status, "manual_required"),
          ),
        )
        .returning({ id: aiRewriteTasks.id });

      if (!updatedTask) return null;

      if (task.sourceMaterialId) {
        await tx
          .update(sourceMaterials)
          .set({ status: "succeeded", updatedAt: now })
          .where(eq(sourceMaterials.id, task.sourceMaterialId));
      }

      return updatedTask;
    });

    if (!updated) {
      return { error: "任务状态已经变化，请刷新后重试" };
    }

    revalidateAiTaskPages(parsedTaskId);

    return { data: updated };
  } catch (error) {
    console.error("标记 AI 改写任务人工处理完成失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function getAiRewriteTaskList(
  filtersInput: AiRewriteTaskListFilters = {},
) {
  await requireAdminSession();

  const filters = normalizeAiRewriteTaskListFilters(filtersInput);
  const whereCondition = getAiRewriteTaskWhereConditions(filters);
  const [countRow] = await db
    .select({ count: count() })
    .from(aiRewriteTasks)
    .leftJoin(categories, eq(aiRewriteTasks.categoryId, categories.id))
    .leftJoin(
      aiRewriteConfigs,
      eq(aiRewriteTasks.rewriteStyleId, aiRewriteConfigs.id),
    )
    .leftJoin(posts, eq(aiRewriteTasks.postId, posts.id))
    .where(whereCondition);
  const pagination = boundOffsetPaginationByTotal(
    filters,
    countRow?.count ?? 0,
  );

  if (pagination.totalCount === 0) return [];

  return db
    .select({
      id: aiRewriteTasks.id,
      sourceUrl: aiRewriteTasks.sourceUrl,
      sourceType: aiRewriteTasks.sourceType,
      sourceTitle: aiRewriteTasks.sourceTitle,
      status: aiRewriteTasks.status,
      progress: aiRewriteTasks.progress,
      currentStep: aiRewriteTasks.currentStep,
      error: aiRewriteTasks.error,
      categoryName: categories.name,
      rewriteStyleName: aiRewriteTasks.rewriteConfigName,
      rewriteProvider: aiRewriteTasks.rewriteProvider,
      model: aiRewriteTasks.rewriteModel,
      maxTokens: sql<
        number | null
      >`coalesce(${aiRewriteTasks.rewriteMaxTokens}, ${aiRewriteConfigs.maxTokens})`,
      imageConfigId: aiRewriteTasks.imageConfigId,
      imageConfigName: aiRewriteTasks.imageConfigName,
      imageProvider: aiRewriteTasks.imageProvider,
      imageModel: aiRewriteTasks.imageModel,
      postId: aiRewriteTasks.postId,
      postSlug: posts.slug,
      postTitle: posts.title,
      postLanguage: posts.language,
      resultTitle: aiRewriteTasks.resultTitle,
      aiInputLength: aiRewriteTasks.aiInputLength,
      rewriteOutputLength: aiRewriteTasks.rewriteOutputLength,
      diagnostics: aiRewriteTasks.diagnostics,
      attempts: aiRewriteTasks.attempts,
      createdAt: aiRewriteTasks.createdAt,
      updatedAt: aiRewriteTasks.updatedAt,
      startedAt: aiRewriteTasks.startedAt,
      finishedAt: aiRewriteTasks.finishedAt,
    })
    .from(aiRewriteTasks)
    .leftJoin(categories, eq(aiRewriteTasks.categoryId, categories.id))
    .leftJoin(
      aiRewriteConfigs,
      eq(aiRewriteTasks.rewriteStyleId, aiRewriteConfigs.id),
    )
    .leftJoin(posts, eq(aiRewriteTasks.postId, posts.id))
    .where(whereCondition)
    .orderBy(desc(aiRewriteTasks.createdAt))
    .offset(pagination.offset)
    .limit(pagination.pageSize);
}

export async function getAiRewriteTaskStatusSummary() {
  await requireAdminSession();

  const [statusRows, [draftRow]] = await Promise.all([
    db
      .select({ status: aiRewriteTasks.status, count: count() })
      .from(aiRewriteTasks)
      .groupBy(aiRewriteTasks.status),
    db
      .select({ count: count() })
      .from(aiRewriteTasks)
      .where(
        and(
          isNotNull(aiRewriteTasks.postId),
          inArray(aiRewriteTasks.status, ["succeeded", "manual_required"]),
        ),
      ),
  ]);
  const countByStatus = new Map(
    statusRows.map((row) => [row.status, Number(row.count) || 0]),
  );

  return {
    active:
      (countByStatus.get("pending") ?? 0) + (countByStatus.get("running") ?? 0),
    failed: countByStatus.get("failed") ?? 0,
    manualRequired: countByStatus.get("manual_required") ?? 0,
    generatedDrafts: Number(draftRow?.count) || 0,
  };
}

export async function getAiRewriteTaskCount(
  filtersInput: AiRewriteTaskListFilters = {},
) {
  await requireAdminSession();

  const filters = normalizeAiRewriteTaskListFilters(filtersInput);
  const whereCondition = getAiRewriteTaskWhereConditions(filters);
  const [result] = await db
    .select({ count: count() })
    .from(aiRewriteTasks)
    .leftJoin(categories, eq(aiRewriteTasks.categoryId, categories.id))
    .leftJoin(
      aiRewriteConfigs,
      eq(aiRewriteTasks.rewriteStyleId, aiRewriteConfigs.id),
    )
    .leftJoin(posts, eq(aiRewriteTasks.postId, posts.id))
    .where(whereCondition);

  return result?.count ?? 0;
}

export async function getAiRewriteTaskDetail(id: number) {
  await requireAdminSession();
  const taskId = parseIntegerId(id);
  if (taskId === null) return null;

  const [task] = await db
    .select({
      id: aiRewriteTasks.id,
      sourceUrl: aiRewriteTasks.sourceUrl,
      sourceType: aiRewriteTasks.sourceType,
      sourceTitle: aiRewriteTasks.sourceTitle,
      sourceContent: aiRewriteTasks.sourceContent,
      sourceFileName: aiRewriteTasks.sourceFileName,
      status: aiRewriteTasks.status,
      progress: aiRewriteTasks.progress,
      currentStep: aiRewriteTasks.currentStep,
      error: aiRewriteTasks.error,
      categoryName: categories.name,
      rewriteStyleName: aiRewriteTasks.rewriteConfigName,
      rewriteProvider: aiRewriteTasks.rewriteProvider,
      model: aiRewriteTasks.rewriteModel,
      maxTokens: sql<
        number | null
      >`coalesce(${aiRewriteTasks.rewriteMaxTokens}, ${aiRewriteConfigs.maxTokens})`,
      imageConfigId: aiRewriteTasks.imageConfigId,
      imageConfigName: aiRewriteTasks.imageConfigName,
      imageProvider: aiRewriteTasks.imageProvider,
      imageModel: aiRewriteTasks.imageModel,
      postId: aiRewriteTasks.postId,
      postSlug: posts.slug,
      postTitle: posts.title,
      postLanguage: posts.language,
      postImgUrl: posts.imgUrl,
      postDescription: posts.description,
      postKeywords: posts.keywords,
      postTranslationSourcePostId: posts.translationSourcePostId,
      resultTitle: aiRewriteTasks.resultTitle,
      scrapedTitle: aiRewriteTasks.scrapedTitle,
      scrapedDescription: aiRewriteTasks.scrapedDescription,
      scrapedHtml: aiRewriteTasks.scrapedHtml,
      aiInputLength: aiRewriteTasks.aiInputLength,
      rewriteOutputLength: aiRewriteTasks.rewriteOutputLength,
      diagnostics: aiRewriteTasks.diagnostics,
      attempts: aiRewriteTasks.attempts,
      createdAt: aiRewriteTasks.createdAt,
      updatedAt: aiRewriteTasks.updatedAt,
      startedAt: aiRewriteTasks.startedAt,
      finishedAt: aiRewriteTasks.finishedAt,
    })
    .from(aiRewriteTasks)
    .leftJoin(categories, eq(aiRewriteTasks.categoryId, categories.id))
    .leftJoin(
      aiRewriteConfigs,
      eq(aiRewriteTasks.rewriteStyleId, aiRewriteConfigs.id),
    )
    .leftJoin(posts, eq(aiRewriteTasks.postId, posts.id))
    .where(eq(aiRewriteTasks.id, taskId))
    .limit(1);

  if (!task) {
    return null;
  }

  const steps = await db
    .select({
      id: aiTaskSteps.id,
      taskId: aiTaskSteps.taskId,
      stepKey: aiTaskSteps.stepKey,
      stepName: aiTaskSteps.stepName,
      attempt: aiTaskSteps.attempt,
      status: aiTaskSteps.status,
      progress: aiTaskSteps.progress,
      message: aiTaskSteps.message,
      error: aiTaskSteps.error,
      payload: aiTaskSteps.payload,
      startedAt: aiTaskSteps.startedAt,
      finishedAt: aiTaskSteps.finishedAt,
      createdAt: aiTaskSteps.createdAt,
      updatedAt: aiTaskSteps.updatedAt,
    })
    .from(aiTaskSteps)
    .where(eq(aiTaskSteps.taskId, taskId))
    .orderBy(asc(aiTaskSteps.attempt), asc(aiTaskSteps.id));

  const artifacts = await db
    .select({
      id: aiRewriteArtifacts.id,
      taskId: aiRewriteArtifacts.taskId,
      taskAttempt: aiRewriteArtifacts.taskAttempt,
      stage: aiRewriteArtifacts.stage,
      stageName: aiRewriteArtifacts.stageName,
      stageAttempt: aiRewriteArtifacts.stageAttempt,
      status: aiRewriteArtifacts.status,
      configSnapshot: aiRewriteArtifacts.configSnapshot,
      model: aiRewriteArtifacts.model,
      maxTokens: aiRewriteArtifacts.maxTokens,
      temperature: aiRewriteArtifacts.temperature,
      prompt: aiRewriteArtifacts.prompt,
      promptLength: aiRewriteArtifacts.promptLength,
      promptTruncated: aiRewriteArtifacts.promptTruncated,
      response: aiRewriteArtifacts.response,
      responseLength: aiRewriteArtifacts.responseLength,
      responseTruncated: aiRewriteArtifacts.responseTruncated,
      readableContent: aiRewriteArtifacts.readableContent,
      readableContentLength: aiRewriteArtifacts.readableContentLength,
      readableContentTruncated: aiRewriteArtifacts.readableContentTruncated,
      metadata: aiRewriteArtifacts.metadata,
      finishReason: aiRewriteArtifacts.finishReason,
      promptTokens: aiRewriteArtifacts.promptTokens,
      completionTokens: aiRewriteArtifacts.completionTokens,
      totalTokens: aiRewriteArtifacts.totalTokens,
      error: aiRewriteArtifacts.error,
      startedAt: aiRewriteArtifacts.startedAt,
      finishedAt: aiRewriteArtifacts.finishedAt,
      createdAt: aiRewriteArtifacts.createdAt,
      updatedAt: aiRewriteArtifacts.updatedAt,
    })
    .from(aiRewriteArtifacts)
    .where(eq(aiRewriteArtifacts.taskId, taskId))
    .orderBy(
      asc(aiRewriteArtifacts.taskAttempt),
      asc(aiRewriteArtifacts.stageAttempt),
      asc(aiRewriteArtifacts.id),
    );

  return { ...task, steps, artifacts };
}
