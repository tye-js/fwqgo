"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@/server/auth/session";
import { generateArticleCoverImage } from "@/server/images/generated-cover";

const coverSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空"),
  description: z.string().trim().optional(),
  keywords: z.string().trim().optional(),
  content: z.string().optional(),
  configId: z.coerce.number().int().positive().optional(),
});

export async function generateArticleCoverImageAction(input: {
  title: string;
  description?: string | null;
  keywords?: string | null;
  content?: string | null;
  configId?: number;
}) {
  try {
    const session = await requireAdminSession();
    const payload = coverSchema.parse(input);
    const result = await generateArticleCoverImage({
      ...payload,
      uploadedBy: session.userId,
    });

    revalidatePath("/end/images/list");

    return {
      success: true,
      url: result.asset.path,
      assetId: result.asset.id,
      prompt: result.prompt,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "生成封面图失败",
    };
  }
}
