"use server";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { enqueueAiRewriteTask } from "@fwqgo/ai/rewrite-task-runner";
import { db } from "@fwqgo/db";
import {
  aiRewriteConfigs,
  aiTaskSteps,
  aiRewriteTasks,
  categories,
  posts,
  sourceMaterials,
} from "@fwqgo/db/schema";

const taskInputSchema = z.object({
  sourceUrl: z.string().url("请输入有效 URL"),
  categoryId: z.coerce.number().int().positive("请选择分类"),
  rewriteStyleId: z.coerce.number().int().positive().optional(),
});

const manualTaskInputSchema = z.object({
  sourceType: z.enum(["text", "email"]),
  sourceTitle: z.string().trim().min(1, "请输入素材标题").max(180),
  sourceContent: z.string().trim().min(20, "素材内容至少需要 20 个字符"),
  categoryId: z.coerce.number().int().positive("请选择分类"),
  rewriteStyleId: z.coerce.number().int().positive().optional(),
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
  categoryId: z.coerce.number().int().positive("请选择分类"),
  rewriteStyleId: z.coerce.number().int().positive().optional(),
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

  if (input.rewriteStyleId) {
    const [style] = await db
      .select({ id: aiRewriteConfigs.id })
      .from(aiRewriteConfigs)
      .where(eq(aiRewriteConfigs.id, input.rewriteStyleId))
      .limit(1);

    if (!style) {
      return "AI 改写配置不存在";
    }
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
        rewriteStyleId: input.rewriteStyleId ?? null,
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
        rewriteStyleId: input.rewriteStyleId ?? null,
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
        sourceUrl: `manual://${input.sourceType}/${Date.now()}`,
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
        sourceUrl: `file://${Date.now()}/${encodeURIComponent(input.sourceFileName)}`,
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

    const [task] = await db
      .update(aiRewriteTasks)
      .set({
        status: "pending",
        currentStep: "等待重试",
        error: null,
        updatedAt: new Date(),
        startedAt: null,
        finishedAt: null,
      })
      .where(
        and(
          eq(aiRewriteTasks.id, taskId),
          inArray(aiRewriteTasks.status, ["failed", "manual_required"]),
        ),
      )
      .returning({
        id: aiRewriteTasks.id,
        sourceMaterialId: aiRewriteTasks.sourceMaterialId,
      });

    if (!task) {
      return { error: "任务不存在，或当前状态不能重试" };
    }

    if (task.sourceMaterialId) {
      await db
        .update(sourceMaterials)
        .set({ status: "queued", updatedAt: new Date() })
        .where(eq(sourceMaterials.id, task.sourceMaterialId));
    }

    await enqueueAiRewriteTask(task.id);
    revalidateAiTaskPages(taskId);

    return { data: task };
  } catch (error) {
    console.error("重试 AI 改写任务失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function deleteAiRewriteTaskAction(taskId: number) {
  try {
    await requireAdminSession();

    const [task] = await db
      .select({
        id: aiRewriteTasks.id,
        status: aiRewriteTasks.status,
        sourceMaterialId: aiRewriteTasks.sourceMaterialId,
        postId: aiRewriteTasks.postId,
      })
      .from(aiRewriteTasks)
      .where(eq(aiRewriteTasks.id, taskId))
      .limit(1);

    if (!task) {
      return { error: "任务不存在或已被删除" };
    }

    if (task.status === "running") {
      return { error: "任务正在处理中，不能删除。请等待任务结束后再删除。" };
    }

    await db.transaction(async (tx) => {
      await tx.delete(aiRewriteTasks).where(eq(aiRewriteTasks.id, taskId));

      if (task.sourceMaterialId) {
        await tx
          .update(sourceMaterials)
          .set({
            status: "deleted",
            updatedAt: new Date(),
          })
          .where(eq(sourceMaterials.id, task.sourceMaterialId));
      }
    });

    revalidateAiTaskPages(taskId);

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

export async function resolveManualRequiredAiRewriteTaskAction(taskId: number) {
  try {
    await requireAdminSession();

    const [task] = await db
      .select({
        id: aiRewriteTasks.id,
        status: aiRewriteTasks.status,
        postId: aiRewriteTasks.postId,
      })
      .from(aiRewriteTasks)
      .where(eq(aiRewriteTasks.id, taskId))
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

    const [updated] = await db
      .update(aiRewriteTasks)
      .set({
        status: "succeeded",
        currentStep: "人工审核已完成",
        error: null,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiRewriteTasks.id, taskId))
      .returning({ id: aiRewriteTasks.id });

    revalidateAiTaskPages(taskId);

    return { data: updated };
  } catch (error) {
    console.error("标记 AI 改写任务人工处理完成失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function getAiRewriteTaskList() {
  await requireAdminSession();

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
      rewriteStyleName: aiRewriteConfigs.styleName,
      postId: aiRewriteTasks.postId,
      postSlug: posts.slug,
      postTitle: posts.title,
      resultTitle: aiRewriteTasks.resultTitle,
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
    .orderBy(desc(aiRewriteTasks.createdAt))
    .limit(50);
}

export async function getAiRewriteTaskDetail(id: number) {
  await requireAdminSession();

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
      rewriteStyleName: aiRewriteConfigs.styleName,
      postId: aiRewriteTasks.postId,
      postSlug: posts.slug,
      postTitle: posts.title,
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
    .where(eq(aiRewriteTasks.id, id))
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
    .where(eq(aiTaskSteps.taskId, id))
    .orderBy(asc(aiTaskSteps.attempt), asc(aiTaskSteps.id));

  return { ...task, steps };
}
