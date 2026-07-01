"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import {
  createImageGenerationConfig,
  deleteImageGenerationConfig,
  getImageGenerationConfigs,
  imageGenerationProviderOptions,
  updateImageGenerationConfig,
} from "@/server/images/generation-config";

const configSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空"),
  provider: z.enum(imageGenerationProviderOptions),
  baseUrl: z.string().trim().url("Base URL 必须是有效 URL"),
  apiKey: z.string().trim().optional(),
  model: z.string().trim().min(1, "模型不能为空"),
  promptTemplate: z.string().trim().min(1, "Prompt 模板不能为空"),
  size: z.string().trim().min(3, "尺寸不能为空"),
  quality: z.string().trim().min(1, "质量参数不能为空"),
  timeoutSeconds: z.coerce.number().int().min(10).max(300),
  enabled: z.preprocess((value) => value === "true" || value === true, z.boolean()),
  isDefault: z.preprocess((value) => value === "true" || value === true, z.boolean()),
});

export async function getImageGenerationConfigList() {
  await requireAdminSession();
  return getImageGenerationConfigs();
}

export async function createImageGenerationConfigAction(formData: FormData) {
  await requireAdminSession();
  const input = configSchema.parse(Object.fromEntries(formData));
  await createImageGenerationConfig(input);
  revalidatePath("/end/settings/image-generation");
}

export async function updateImageGenerationConfigAction(
  id: number,
  formData: FormData,
) {
  await requireAdminSession();
  const input = configSchema.parse(Object.fromEntries(formData));
  await updateImageGenerationConfig(id, input);
  revalidatePath("/end/settings/image-generation");
}

export async function deleteImageGenerationConfigAction(id: number) {
  await requireAdminSession();
  await deleteImageGenerationConfig(id);
  revalidatePath("/end/settings/image-generation");
}
