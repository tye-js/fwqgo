"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { isPublicHttpUrl } from "@fwqgo/core/network-url";
import {
  aiProviderOptions,
  createAiRewriteConfig,
  deleteAiRewriteConfig,
  getAiRewriteConfigs,
  updateAiRewriteConfig,
} from "@fwqgo/ai/rewrite-config";
import { checkAiRewriteConfigStatus } from "@fwqgo/ai/rewrite-status-check";
import { defineAdminAction } from "@/features/cms/lib/define-admin-action";

const configSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空"),
  provider: z.enum(aiProviderOptions),
  baseUrl: z
    .string()
    .trim()
    .url("Base URL 必须是有效 URL")
    .refine(isPublicHttpUrl, {
      message: "Base URL 只允许公网 http/https 地址",
    }),
  apiKey: z.string().trim().optional(),
  model: z.string().trim().min(1, "模型不能为空"),
  basePrompt: z.string().trim().min(1, "正文改写 Prompt 不能为空"),
  metadataPrompt: z.string().trim().min(1, "元信息 Prompt 不能为空"),
  styleName: z.string().trim().min(1, "风格名称不能为空"),
  stylePrompt: z.string().trim().min(1, "正文改写风格不能为空"),
  metadataStylePrompt: z.string().trim().min(1, "元信息生成风格不能为空"),
  englishStylePrompt: z.string().trim().min(1, "英文正文生成风格不能为空"),
  englishMetadataStylePrompt: z
    .string()
    .trim()
    .min(1, "英文 SEO 生成风格不能为空"),
  temperature: z.coerce.number().int().min(0).max(200),
  maxTokens: z.coerce.number().int().min(1000).max(64000),
  enabled: z.preprocess(
    (value) => value === "true" || value === true,
    z.boolean(),
  ),
  isDefault: z.preprocess(
    (value) => value === "true" || value === true,
    z.boolean(),
  ),
});

function parseConfigFormData(formData: FormData) {
  return configSchema.parse(Object.fromEntries(formData));
}

const createAiRewriteConfigMutation = defineAdminAction({
  action: "ai_rewrite_config.create",
  entityType: "ai_rewrite_config",
  parse: parseConfigFormData,
  execute: async (input) => {
    const result = await createAiRewriteConfig(input);
    if (!result) throw new Error("AI 改写配置创建失败");
    revalidatePath("/collect/ai-rewrite");
    return result;
  },
  successMessage: "AI 改写配置已添加",
  errorTitle: "AI 改写配置添加失败",
  errorSuggestion: "请检查 Base URL、模型、API Key 和数值范围。",
  entityId: (_input, result) => result?.id,
});

const updateAiRewriteConfigMutation = defineAdminAction({
  action: "ai_rewrite_config.update",
  entityType: "ai_rewrite_config",
  parse: (input: { id: number; formData: FormData }) => ({
    id: z.number().int().positive("配置 ID 无效").parse(input.id),
    config: parseConfigFormData(input.formData),
  }),
  execute: async ({ id, config }) => {
    const result = await updateAiRewriteConfig(id, config);
    if (!result) throw new Error("AI 改写配置不存在或已被删除");
    revalidatePath("/collect/ai-rewrite");
    return result;
  },
  successMessage: "AI 改写配置已更新",
  errorTitle: "AI 改写配置更新失败",
  errorSuggestion: "请检查 Base URL、模型、API Key 和数值范围。",
  entityId: ({ id }) => id,
});

const deleteAiRewriteConfigMutation = defineAdminAction({
  action: "ai_rewrite_config.delete",
  entityType: "ai_rewrite_config",
  parse: (id: number) => z.number().int().positive("配置 ID 无效").parse(id),
  execute: async (id) => {
    await deleteAiRewriteConfig(id);
    revalidatePath("/collect/ai-rewrite");
    return { id };
  },
  successMessage: "AI 改写配置已删除",
  errorTitle: "AI 改写配置删除失败",
  errorSuggestion: "请刷新配置列表后重试。",
  entityId: (id) => id,
});

export async function getAiRewriteConfigList() {
  await requireAdminSession();
  return getAiRewriteConfigs();
}

export async function createAiRewriteConfigAction(formData: FormData) {
  return createAiRewriteConfigMutation(formData);
}

export async function updateAiRewriteConfigAction(
  id: number,
  formData: FormData,
) {
  return updateAiRewriteConfigMutation({ id, formData });
}

export async function deleteAiRewriteConfigAction(id: number) {
  return deleteAiRewriteConfigMutation(id);
}

export async function checkAiRewriteConfigStatusAction(id: number) {
  await requireAdminSession();
  const configId = z.coerce.number().int().positive().parse(id);
  return checkAiRewriteConfigStatus(configId);
}
