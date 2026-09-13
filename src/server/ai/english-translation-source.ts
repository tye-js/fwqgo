import { createHash } from "node:crypto";
import { z } from "zod";
import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";

const translationSourceSchema = z.object({
  workflow: z.literal("english-translation-v1"),
  sourcePostId: postgresIntegerIdSchema,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  description: z.string().nullable(),
  keywords: z.string().nullable(),
});

export type EnglishTranslationSource = z.infer<typeof translationSourceSchema>;

export function englishTranslationSourceHash(post: {
  title: string;
  content: string;
  description: string | null;
  keywords: string | null;
  categoryId: number;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        post.title,
        post.content,
        post.description,
        post.keywords,
        post.categoryId,
      ]),
    )
    .digest("hex");
}

export function createEnglishTranslationSource(
  post: Parameters<typeof englishTranslationSourceHash>[0] & { id: number },
): EnglishTranslationSource {
  return {
    workflow: "english-translation-v1",
    sourcePostId: post.id,
    sourceHash: englishTranslationSourceHash(post),
    description: post.description,
    keywords: post.keywords,
  };
}

export function readEnglishTranslationSource(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = translationSourceSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
