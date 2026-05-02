"use server";

import { db } from "@/server/db";
import { posts } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";

export async function incrementPostViews({ slug }: { slug: string }) {
  try {
    await db
      .update(posts)
      .set({
        views: sql`${posts.views} + 1`,
      })
      .where(eq(posts.slug, slug));

    return true;
  } catch (error) {
    console.error("Failed to increment post views:", error);
    return false;
  }
}
