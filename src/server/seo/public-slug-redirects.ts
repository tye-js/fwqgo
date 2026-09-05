import { and, eq } from "drizzle-orm";

import { readDb } from "@fwqgo/db";
import { publicSlugRedirects } from "@fwqgo/db/schema";

export type PublicSlugKind = "post" | "category" | "tag";

export async function findPublicSlugRedirect(
  kind: PublicSlugKind,
  language: "zh" | "en",
  oldSlug: string,
) {
  const [redirect] = await readDb
    .select({
      postId: publicSlugRedirects.postId,
      categoryId: publicSlugRedirects.categoryId,
      tagId: publicSlugRedirects.tagId,
    })
    .from(publicSlugRedirects)
    .where(
      and(
        eq(publicSlugRedirects.kind, kind),
        eq(publicSlugRedirects.language, language),
        eq(publicSlugRedirects.oldSlug, oldSlug),
      ),
    )
    .limit(1);
  return redirect ?? null;
}
