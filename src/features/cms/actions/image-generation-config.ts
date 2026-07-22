"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { isPublicHttpUrl } from "@fwqgo/core/network-url";
import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import {
  createImageGenerationConfig,
  deleteImageGenerationConfig,
  getImageGenerationConfigs,
  imageGenerationProviderOptions,
  updateImageGenerationConfig,
} from "@/server/images/generation-config";
import { defineAdminAction } from "@/features/cms/lib/define-admin-action";

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

function parseConfigFormData(formData: FormData) {
  return configSchema.parse(Object.fromEntries(formData));
}

const createImageGenerationConfigMutation = defineAdminAction({
  action: "image_generation_config.create",
  entityType: "image_generation_config",
  parse: parseConfigFormData,
  execute: async (input) => {
    const result = await createImageGenerationConfig(input);
    revalidateImageGenerationPages();
    return result;
  },
  successMessage: "生图配置已添加",
  errorTitle: "生图配置添加失败",
  errorSuggestion: "请检查 Base URL、模型、API Key、尺寸和超时时间。",
  entityId: (_input, result) => result?.id,
});

const updateImageGenerationConfigMutation = defineAdminAction({
  action: "image_generation_config.update",
  entityType: "image_generation_config",
  parse: (input: { id: number; formData: FormData }) => ({
    id: postgresIntegerIdSchema.parse(input.id),
    config: parseConfigFormData(input.formData),
  }),
  execute: async ({ id, config }) => {
    const result = await updateImageGenerationConfig(id, config);
    revalidateImageGenerationPages();
    return result;
  },
  successMessage: "生图配置已更新",
  errorTitle: "生图配置更新失败",
  errorSuggestion: "请检查 Base URL、模型、API Key、尺寸和超时时间。",
  entityId: ({ id }) => id,
});

const deleteImageGenerationConfigMutation = defineAdminAction({
  action: "image_generation_config.delete",
  entityType: "image_generation_config",
  parse: (id: number) => postgresIntegerIdSchema.parse(id),
  execute: async (id) => {
    const result = await deleteImageGenerationConfig(id);
    revalidateImageGenerationPages();
    return result;
  },
  successMessage: "生图配置已删除",
  errorTitle: "生图配置删除失败",
  errorSuggestion: "请刷新配置列表后重试。",
  entityId: (id) => id,
});

export async function getImageGenerationConfigList() {
  await requireAdminSession();
  return getImageGenerationConfigs();
}

export async function createImageGenerationConfigAction(formData: FormData) {
  return createImageGenerationConfigMutation(formData);
}

export async function updateImageGenerationConfigAction(
  id: number,
  formData: FormData,
) {
  return updateImageGenerationConfigMutation({ id, formData });
}

export async function deleteImageGenerationConfigAction(id: number) {
  return deleteImageGenerationConfigMutation(id);
}
