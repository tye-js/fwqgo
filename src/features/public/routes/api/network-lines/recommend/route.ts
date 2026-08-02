import { connection, NextResponse } from "next/server";

import {
  normalizeNetworkRecommendationInput,
  validateNetworkRecommendationInput,
  type NetworkRecommendationRequestV1,
} from "@fwqgo/core/network-assessment";
import { recommendNetworkLines } from "@/server/network-assessment/public-repository";

const MAX_BODY_BYTES = 16 * 1024;

async function readLimitedRequestBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw new Error("body_too_large");
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
      throw new Error("body_too_large");
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  await connection();
  if (
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  ) {
    return response({ error: "content_type_required" }, 415);
  }

  try {
    const body = await readLimitedRequestBody(request);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return response({ error: "invalid_json" }, 400);
    }
    const issues = validateNetworkRecommendationInput(parsed);
    if (issues.length > 0) {
      return response(
        {
          error: "invalid_input",
          issues: issues.slice(0, 20).map((issue) => ({
            path: issue.path,
            code: issue.code,
          })),
        },
        400,
      );
    }
    const input = normalizeNetworkRecommendationInput(
      parsed as NetworkRecommendationRequestV1,
    );
    const result = await recommendNetworkLines(input);
    return response(result);
  } catch (error) {
    if (error instanceof Error && error.message === "body_too_large") {
      return response({ error: "body_too_large" }, 413);
    }
    console.error("Public network assessment failed:", error);
    return response({ error: "network_assessment_unavailable" }, 503);
  }
}
