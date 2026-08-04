import { asc, eq } from "drizzle-orm";

import { readDb } from "@fwqgo/db";
import { posts } from "@fwqgo/db/schema";
import { regeneratePostInternalLinks } from "@/server/posts/internal-links";

function readLimit() {
  const value = process.argv
    .find((argument) => argument.startsWith("--limit="))
    ?.slice("--limit=".length);
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1_000;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const activateHighConfidence = process.argv.includes(
    "--activate-high-confidence",
  );
  const rows = await readDb
    .select({ id: posts.id, title: posts.title, language: posts.language })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(asc(posts.id))
    .limit(readLimit());

  console.log(
    `Internal-link backfill candidates=${rows.length}, mode=${apply ? "apply" : "dry-run"}, activation=${activateHighConfidence ? "high-confidence" : "suggestions-only"}`,
  );
  if (!apply) return;

  let succeeded = 0;
  let failed = 0;
  for (const post of rows) {
    try {
      const result = await regeneratePostInternalLinks({
        postId: post.id,
        mode: activateHighConfidence
          ? "activate-high-confidence"
          : "suggestions-only",
        generatedBy: "rule",
      });
      succeeded += 1;
      console.log(
        `#${post.id} ${post.language} ${post.title}: generated=${result.generated}, active=${result.active}, suggested=${result.suggested}`,
      );
    } catch (error) {
      failed += 1;
      console.error(
        `#${post.id} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(`Finished: succeeded=${succeeded}, failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
