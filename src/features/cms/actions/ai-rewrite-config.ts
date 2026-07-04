"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import {
  aiProviderOptions,
  createAiRewriteConfig,
  deleteAiRewriteConfig,
  getAiRewriteConfigs,
  updateAiRewriteConfig,
} from "@fwqgo/ai/rewrite-config";

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const configSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空"),
  provider: z.enum(aiProviderOptions),
  baseUrl: z
    .string()
    .trim()
    .url("Base URL 必须是有效 URL")
    .refine(isHttpUrl, {
      message: "Base URL 只支持 http 或 https",
    }),
  apiKey: z.string().trim().optional(),
  model: z.string().trim().min(1, "模型不能为空"),
  basePrompt: z.string().trim().min(1, "正文改写 Prompt 不能为空"),
  metadataPrompt: z.string().trim().min(1, "元信息 Prompt 不能为空"),
  styleName: z.string().trim().min(1, "风格名称不能为空"),
  stylePrompt: z.string().trim().min(1, "正文改写风格不能为空"),
  metadataStylePrompt: z.string().trim().min(1, "元信息生成风格不能为空"),
  englishStylePrompt: z.string().trim().min(1, "英文正文生成风格不能为空"),
  englishMetadataStylePrompt: z.string().trim().min(1, "英文 SEO 生成风格不能为空"),
  temperature: z.coerce.number().int().min(0).max(200),
  maxTokens: z.coerce.number().int().min(1000).max(64000),
  enabled: z.preprocess((value) => value === "true" || value === true, z.boolean()),
  isDefault: z.preprocess((value) => value === "true" || value === true, z.boolean()),
});

export async function getAiRewriteConfigList() {
  await requireAdminSession();
  return getAiRewriteConfigs();
}

export async function createAiRewriteConfigAction(formData: FormData) {
  await requireAdminSession();
  const input = configSchema.parse(Object.fromEntries(formData));
  await createAiRewriteConfig(input);
  revalidatePath("/collect/ai-rewrite");
}

export async function updateAiRewriteConfigAction(id: number, formData: FormData) {
  await requireAdminSession();
  const input = configSchema.parse(Object.fromEntries(formData));
  await updateAiRewriteConfig(id, input);
  revalidatePath("/collect/ai-rewrite");
}

export async function deleteAiRewriteConfigAction(id: number) {
  await requireAdminSession();
  await deleteAiRewriteConfig(id);
  revalidatePath("/collect/ai-rewrite");
}
