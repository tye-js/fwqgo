import { z } from "zod";

import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import { isRenderableImageSrc } from "@fwqgo/core/image-src";

const tagSchema = z.object({
  tag: z.object({
    id: postgresIntegerIdSchema.optional(),
    name: z.string().trim().min(1).max(160),
    slug: z.string().trim().max(320),
  }),
});

export const postEditSchema = z
  .object({
    id: postgresIntegerIdSchema,
    title: z
      .string()
      .trim()
      .min(1, "文章标题不能为空")
      .max(300, "文章标题不能超过 300 个字符"),
    slug: z
      .string()
      .trim()
      .min(1, "文章 slug 不能为空")
      .max(320, "文章 slug 不能超过 320 个字符")
      .refine(
        (value) => !/[\s/?#\\\u0000-\u001f\u007f]/.test(value),
        "文章 slug 含有无效字符",
      ),
    published: z.boolean(),
    allowSlugChange: z.boolean().optional(),
    expectedUpdatedAt: z.iso.datetime().nullable().optional(),
    description: z.string().trim().max(800, "文章简述不能超过 800 个字符"),
    content: z.string().trim().min(1, "文章正文不能为空"),
    imgUrl: z
      .string()
      .trim()
      .refine(
        (value) => !value || isRenderableImageSrc(value),
        "封面地址格式不正确",
      )
      .nullable()
      .optional(),
    categoryId: postgresIntegerIdSchema,
    recommendTagName: z.string().trim().max(160, "推荐标签不能超过 160 个字符"),
    keywords: z.string().max(800, "关键词不能超过 800 个字符"),
    newTags: z.array(tagSchema).max(100, "文章标签不能超过 100 个"),
  })
  .superRefine((input, context) => {
    if (!input.published) return;
    if (!input.description) {
      context.addIssue({
        code: "custom",
        path: ["description"],
        message: "发布前请填写文章简述",
      });
    }
    if (!input.newTags.length) {
      context.addIssue({
        code: "custom",
        path: ["newTags"],
        message: "发布前请添加标签",
      });
    }
  });

export type PostEditInput = z.infer<typeof postEditSchema>;

export class PostEditValidationError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 409 = 400,
  ) {
    super(message);
    this.name = "PostEditValidationError";
  }
}
