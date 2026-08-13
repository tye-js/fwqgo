"use server";

import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { formPostgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import {
  enqueueCustomImageGenerationTask,
  serializeCoverTask,
} from "@/server/images/cover-generation-task-runner";

const customImageSchema = z.object({
  prompt: z.string().trim().min(4, "请输入更具体的生图要求").max(4000),
  fileName: z.string().trim().max(120).optional(),
  altZh: z.string().trim().max(180).optional(),
  configId: formPostgresIntegerIdSchema.optional(),
});

export async function generateCustomImageAction(input: {
  prompt: string;
  fileName?: string | null;
  altZh?: string | null;
  configId?: number;
}) {
  try {
    const session = await requireAdminSession();
    const payload = customImageSchema.parse(input);
    const task = await enqueueCustomImageGenerationTask({
      ...payload,
      createdBy: session.userId,
    });

    return {
      success: true,
      queued: true,
      batchId: task.batchId,
      task: serializeCoverTask(task),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "AI 生图失败",
    };
  }
}
