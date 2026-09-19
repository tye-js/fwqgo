import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import {
  publicCacheEvents,
  revalidatePublicCacheEventFromRouteHandler,
} from "@fwqgo/cache/tags";
import {
  PUBLIC_CACHE_EVENT_ID_LIMIT,
  PUBLIC_CACHE_EVENT_TOPIC_SLUG_LIMIT,
} from "@fwqgo/cache/public-cache-event-payload";
import { purgePublicEdgeCache } from "@/server/cache/public-edge-cache";

// 一个分片最多携带 50 个 slug，slug 长度上限 360，postSlugs 与 knowledgeSlugs
// 同时打满时最坏情况约 37 KB；留出余量避免合法分片被体积上限挡掉。
const MAX_BODY_BYTES = 64 * 1024;
const MAX_BODY_LABEL = `${MAX_BODY_BYTES / 1024} KB`;
const requestSchema = z.object({
  event: z.enum(publicCacheEvents),
  payload: z
    .object({
      postIds: z
        .array(z.number().int().positive())
        .max(PUBLIC_CACHE_EVENT_ID_LIMIT)
        .optional(),
      postSlugs: z
        .array(z.string().trim().min(1).max(360))
        .max(PUBLIC_CACHE_EVENT_ID_LIMIT)
        .optional(),
      categoryIds: z
        .array(z.number().int().positive())
        .max(PUBLIC_CACHE_EVENT_ID_LIMIT)
        .optional(),
      tagIds: z
        .array(z.number().int().positive())
        .max(PUBLIC_CACHE_EVENT_ID_LIMIT)
        .optional(),
      topicSlugs: z
        .array(z.string().trim().min(1).max(160))
        .max(PUBLIC_CACHE_EVENT_TOPIC_SLUG_LIMIT)
        .optional(),
      knowledgeArticleIds: z
        .array(z.number().int().positive())
        .max(PUBLIC_CACHE_EVENT_ID_LIMIT)
        .optional(),
      knowledgeSlugs: z
        .array(z.string().trim().min(1).max(360))
        .max(PUBLIC_CACHE_EVENT_ID_LIMIT)
        .optional(),
    })
    .default({}),
});

function secretsMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

async function readLimitedRequestBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw new Error(`请求体超过 ${MAX_BODY_LABEL} 限制`);
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error(`请求体超过 ${MAX_BODY_LABEL} 限制`);
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export async function POST(request: Request) {
  const expectedSecret = process.env.WEB_REVALIDATION_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Web cache revalidation is not configured" },
      { status: 503 },
    );
  }
  const authorization = request.headers.get("authorization") ?? "";
  const actualSecret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!actualSecret || !secretsMatch(actualSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const text = await readLimitedRequestBody(request);
    const input = requestSchema.parse(JSON.parse(text));
    const targets = revalidatePublicCacheEventFromRouteHandler(
      input.event,
      input.payload,
    );
    after(async () => {
      try {
        const result = await purgePublicEdgeCache(input.event, input.payload);
        if (result.configured)
          console.info("public.edge_cache.purged", {
            event: input.event,
            urls: result.purgedUrls,
          });
      } catch (error) {
        console.error("public.edge_cache.purge_failed", {
          event: input.event,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });
    return NextResponse.json({
      ok: true,
      event: input.event,
      revalidatedTags: targets.tags.length,
      revalidatedPaths: targets.paths.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? (error.issues[0]?.message ?? "Invalid request")
            : error instanceof Error
              ? error.message
              : "Invalid request",
      },
      { status: 400 },
    );
  }
}
