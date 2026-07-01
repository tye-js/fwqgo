import { eq } from "drizzle-orm";

import { normalizeArticleHtml } from "@fwqgo/core/content";
import { db } from "@fwqgo/db";
import { posts } from "@fwqgo/db/schema";
import { shortenArticleOutboundLinks } from "@/server/links/outbound-short-link";

const shouldWrite = process.argv.includes("--write");

async function main() {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      content: posts.content,
    })
    .from(posts);

  let changedCount = 0;

  for (const post of rows) {
    const converted = normalizeArticleHtml(
      await shortenArticleOutboundLinks(post.content),
    );

    if (converted === post.content) {
      continue;
    }

    changedCount += 1;
    console.log(`${shouldWrite ? "convert" : "would_convert"} post ${post.id}: ${post.title}`);

    if (shouldWrite) {
      await db
        .update(posts)
        .set({
          content: converted,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, post.id));
    }
  }

  console.log(
    `${shouldWrite ? "converted" : "would_convert"} ${changedCount}/${rows.length} posts`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
