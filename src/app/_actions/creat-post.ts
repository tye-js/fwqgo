"use server";

import { type CreatePostParams } from "@/types/post.types";
import { createPost as createPostWithTags } from "@/app/_actions/post";

export async function createPost(input: CreatePostParams) {
  const result = await createPostWithTags(input);

  if (result.error) {
    const message = "message" in result ? result.message : undefined;

    return {
      error: result.error,
      message: typeof message === "string" ? message : result.error,
    };
  }

  return { success: true, data: "data" in result ? result.data : undefined };
}
