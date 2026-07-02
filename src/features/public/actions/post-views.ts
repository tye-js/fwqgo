"use server";

import { writeDb } from "@fwqgo/db";
import { posts } from "@fwqgo/db/schema";
import { eq, sql } from "drizzle-orm";

export async function incrementPostViews({ slug }: { slug: string }) {
  try {
    const updatedPosts = await writeDb
      .update(posts)
      .set({
        views: sql`${posts.views} + 1`,
      })
      .where(eq(posts.slug, slug))
      .returning({ id: posts.id });

    return updatedPosts.length > 0;
  } catch (error) {
    console.error("Failed to increment post views:", error);
    return false;
  }
}
