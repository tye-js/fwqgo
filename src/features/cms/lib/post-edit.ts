import { z } from "zod";

import {
  ARTICLE_SLUG_ISSUE_MESSAGES,
  ARTICLE_SLUG_MAX_LENGTH,
  hasInvalidArticleSlugCharacters,
} from "@fwqgo/core/article-slug";
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
      .min(1, ARTICLE_SLUG_ISSUE_MESSAGES.empty)
      .max(ARTICLE_SLUG_MAX_LENGTH, ARTICLE_SLUG_ISSUE_MESSAGES["too-long"])
      // 规则与创建路径、后台表单共用一份（`@fwqgo/core/article-slug`）。
      // 这里只用字符检查：长度与非空由上面的 min/max 负责，否则会同时报两条。
      .refine(
        (value) => !hasInvalidArticleSlugCharacters(value),
        ARTICLE_SLUG_ISSUE_MESSAGES["invalid-characters"],
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
