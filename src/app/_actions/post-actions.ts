"use server";

import { db } from "@/server/db";

export async function incrementPostViews({ slug }: { slug: string }) {
  try {
    await db.post.update({
      where: { slug },
      data: {
        views: {
          increment: 1,
        },
      },
    });
  } catch (error) {
    console.error("Failed to increment post views:", error);
  }
}
