"use server";

import { analyticsDb } from "@fwqgo/db";
import { posts } from "@fwqgo/db/schema";
import { and, eq, sql } from "drizzle-orm";

export async function incrementPostViews({ slug }: { slug: string }) {
  try {
    const updatedPosts = await analyticsDb
      .update(posts)
      .set({
        views: sql`${posts.views} + 1`,
      })
      .where(and(eq(posts.slug, slug), eq(posts.published, true)))
      .returning({ id: posts.id });

    return updatedPosts.length > 0;
  } catch (error) {
    console.error("Failed to increment post views:", error);
    return false;
  }
}
