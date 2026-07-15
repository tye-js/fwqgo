"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { isPublicHttpUrl } from "@fwqgo/core/network-url";
import {
  createImageGenerationConfig,
  deleteImageGenerationConfig,
  getImageGenerationConfigs,
  imageGenerationProviderOptions,
  updateImageGenerationConfig,
} from "@/server/images/generation-config";

const removedCoverPlaceholderPattern = /\{(?:title|content)\}/i;
const promptTemplateSchema = z
  .string()
  .trim()
  .min(1, "Prompt 模板不能为空")
  .refine((value) => !removedCoverPlaceholderPattern.test(value), {
    message: "Prompt 不再支持 {title} 或 {content}，请删除后保存",
  });

const configSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空"),
  provider: z.enum(imageGenerationProviderOptions),
  baseUrl: z
    .string()
    .trim()
    .url("Base URL 必须是有效 URL")
    .refine(isPublicHttpUrl, {
      message: "Base URL 只允许公网 http/https 地址",
    }),
  apiKey: z.string().trim().optional(),
  model: z.string().trim().min(1, "模型不能为空"),
  promptTemplate: promptTemplateSchema,
  englishPromptTemplate: promptTemplateSchema,
  size: z.string().trim().min(3, "尺寸不能为空"),
  quality: z.string().trim().min(1, "质量参数不能为空"),
  timeoutSeconds: z.coerce.number().int().min(10).max(300),
  enabled: z.preprocess(
    (value) => value === "true" || value === true,
    z.boolean(),
  ),
  isDefault: z.preprocess(
    (value) => value === "true" || value === true,
    z.boolean(),
  ),
});

function revalidateImageGenerationPages() {
  revalidatePath("/settings/image-generation");
  revalidatePath("/images/ai-generate");
  revalidatePath("/images/covers");
  revalidatePath("/ai-tasks");
}

export async function getImageGenerationConfigList() {
  await requireAdminSession();
  return getImageGenerationConfigs();
}

export async function createImageGenerationConfigAction(formData: FormData) {
  await requireAdminSession();
  const input = configSchema.parse(Object.fromEntries(formData));
  const result = await createImageGenerationConfig(input);
  revalidateImageGenerationPages();
  return result;
}

export async function updateImageGenerationConfigAction(
  id: number,
  formData: FormData,
) {
  await requireAdminSession();
  const input = configSchema.parse(Object.fromEntries(formData));
  const result = await updateImageGenerationConfig(id, input);
  revalidateImageGenerationPages();
  return result;
}

export async function deleteImageGenerationConfigAction(id: number) {
  await requireAdminSession();
  const result = await deleteImageGenerationConfig(id);
  revalidateImageGenerationPages();
  return result;
}
