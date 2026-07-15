import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  publicCacheEvents,
  revalidatePublicCacheEventFromRouteHandler,
} from "@fwqgo/cache/tags";

const MAX_BODY_BYTES = 16 * 1024;
const requestSchema = z.object({
  event: z.enum(publicCacheEvents),
  payload: z
    .object({
      postIds: z.array(z.number().int().positive()).max(50).optional(),
      postSlugs: z.array(z.string().trim().min(1).max(360)).max(50).optional(),
      categoryIds: z.array(z.number().int().positive()).max(50).optional(),
      tagIds: z.array(z.number().int().positive()).max(50).optional(),
      topicSlugs: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
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
  if (declaredLength > MAX_BODY_BYTES) throw new Error("请求体超过 16 KB 限制");
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
      throw new Error("请求体超过 16 KB 限制");
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
