import { z } from "zod";
import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import { parsePostgresIntegerId, slugify } from "@fwqgo/core/utils";
import { postEditSchema } from "@/features/cms/lib/post-edit";

// English tasks keep their manual form; collection tasks save directly to drafts.
export const manualArticleSchema = z.object({
  title: postEditSchema.shape.title,
  slug: postEditSchema.shape.slug,
  description: postEditSchema.shape.description.min(1, "请填写英文摘要"),
  keywords: postEditSchema.shape.keywords,
  content: postEditSchema.shape.content.max(
    2_000_000,
    "正文不能超过 200 万个字符",
  ),
  taskId: postgresIntegerIdSchema,
  expectedUpdatedAt: z.iso.datetime(),
  tagNames: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(160)
        .refine(
          (name) => Boolean(slugify(name)),
          "标签名称需要包含中文、英文或数字",
        ),
    )
    .min(1, "请至少填写一个标签")
    .max(100),
});
export type ManualArticleInput = z.infer<typeof manualArticleSchema>;
export function getManualEnglishSourceId(sourceUrl: string) {
  const match = /^post:\/\/(\d+)\/english$/.exec(sourceUrl);
  return match?.[1] ? parsePostgresIntegerId(match[1]) : null;
}
