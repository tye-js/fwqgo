"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { generateCustomImage } from "@/server/images/generated-custom-image";

const customImageSchema = z.object({
  prompt: z.string().trim().min(4, "请输入更具体的生图要求").max(4000),
  fileName: z.string().trim().max(120).optional(),
  altZh: z.string().trim().max(180).optional(),
  configId: z.coerce.number().int().positive().optional(),
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
    const result = await generateCustomImage({
      ...payload,
      uploadedBy: session.userId,
    });

    revalidatePath("/end/images/ai-generate");
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
      error: error instanceof Error ? error.message : "AI 生图失败",
    };
  }
}
