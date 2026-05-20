"use server";

import { type CreatePostParams } from "@/types/post.types";
import { createPost as createPostWithTags } from "@/app/_actions/post";

export async function createPost(input: CreatePostParams) {
  const result = await createPostWithTags(input);

  if (result.error) {
    return result;
  }

  return { success: true, data: result.data };
}
