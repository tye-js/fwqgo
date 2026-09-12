import { z } from "zod";

import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import { parsePostgresIntegerId, slugify } from "@fwqgo/core/utils";
import { postEditSchema } from "@/features/cms/lib/post-edit";

export const manualArticleSchema = postEditSchema
  .pick({
    title: true,
    slug: true,
    description: true,
    content: true,
    keywords: true,
  })
  .extend({
    taskId: postgresIntegerIdSchema,
    expectedUpdatedAt: z.iso.datetime(),
    content: postEditSchema.shape.content.max(
      2_000_000,
      "正文不能超过 200 万个字符",
    ),
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
