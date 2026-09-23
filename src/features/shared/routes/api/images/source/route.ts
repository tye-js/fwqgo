import { open } from "node:fs/promises";

import {
  normalizeUploadPath,
  uploadPathToFilePath,
} from "@/server/images/upload-paths";
import {
  createWeakFileEtag,
  matchesHttpCacheValidators,
} from "@fwqgo/core/http-cache";
import { readResponseBodyWithLimit } from "@fwqgo/core/bounded-response-body";
import {
  attachRequestId,
  getRequestId,
  structuredLog,
} from "@fwqgo/core/structured-log";
import { type NextRequest, NextResponse } from "next/server";

const DEFAULT_PUBLIC_ORIGIN = "https://fwqgo.com";
const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024;
const REMOTE_UPLOAD_HOSTS = new Set(["fwqgo.com", "cms.fwqgo.com"]);
const NEGATIVE_CACHE_TTL_MS = 60_000;
const MAX_NEGATIVE_CACHE_ENTRIES = 500;

/**
 * 本地文件的缓存策略。
 *
 * `/uploads/<时间戳>-<名字>.webp` 只写一次（`writeNewUploadFile` 用 `wx` 标志，写不进去就失败），
 * 真的替换内容时走 `replaceImageAssetFile`：文件路径不变，但会把 posts / knowledge / users /
 * 推广位的引用改写成 `?v=<内容哈希>`，并给缩略图与大图变体换名。也就是说**同一个 URL 的字节
 * 不会再变**，可以放心交给浏览器和边缘节点长期缓存。
 *
 * 这里曾经是 `max-age=0, must-revalidate`，等于每个访客、每个宽度变体都要回源做一次条件请求；
 * 上传文件名带时间戳，本质上是内容寻址，那个保守策略没有必要。
 */
const LOCAL_IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

const ALLOWED_REMOTE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);
type RemoteImage = { file: Buffer; contentType: string };
const remoteImageRequests = new Map<string, Promise<RemoteImage | null>>();
const missingRemoteImages = new Map<string, number>();

function getMimeType(filePath: string) {
  const lowerFilePath = filePath.toLowerCase();

  if (lowerFilePath.endsWith(".jpg") || lowerFilePath.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lowerFilePath.endsWith(".png")) {
    return "image/png";
  }

  if (lowerFilePath.endsWith(".gif")) {
    return "image/gif";
  }

  if (lowerFilePath.endsWith(".webp")) {
    return "image/webp";
  }

  if (lowerFilePath.endsWith(".avif")) {
    return "image/avif";
  }

  return "application/octet-stream";
}

function getPublicOrigins() {
  return [
    process.env.NEXT_PUBLIC_URL,
    process.env.NEXT_PUBLIC_CMS_URL,
    DEFAULT_PUBLIC_ORIGIN,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return value.replace(/\/+$/, "");
      }
    });
}

function getRemoteUploadUrls(publicPath: string) {
  return [
    ...new Set(
      getPublicOrigins()
        .map((origin) => {
          try {
            const url = new URL(`${origin}${publicPath}`);
            return REMOTE_UPLOAD_HOSTS.has(url.hostname)
              ? url.toString()
              : null;
          } catch {
            return null;
          }
        })
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

async function fetchRemoteUploadImageUncached(publicPath: string) {
  for (const url of getRemoteUploadUrls(publicPath)) {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);

    if (!response?.ok) {
      await response?.body?.cancel();
      continue;
    }

    const contentType = response.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();
    if (!contentType || !ALLOWED_REMOTE_IMAGE_TYPES.has(contentType)) {
      await response.body?.cancel();
      continue;
    }

    const contentLength = Number.parseInt(
      response.headers.get("content-length") ?? "",
      10,
    );
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_REMOTE_IMAGE_BYTES
    ) {
      await response.body?.cancel();
      continue;
    }

    const body = await readResponseBodyWithLimit(
      response,
      MAX_REMOTE_IMAGE_BYTES,
    );
    if (!body) continue;
    const file = Buffer.from(body);

    return { file, contentType };
  }

  return null;
}

async function fetchRemoteUploadImage(publicPath: string) {
  const now = Date.now();
  const missingUntil = missingRemoteImages.get(publicPath) ?? 0;
  if (missingUntil > now) return null;
  if (missingUntil) missingRemoteImages.delete(publicPath);

  const existingRequest = remoteImageRequests.get(publicPath);
  if (existingRequest) return existingRequest;

  const request = fetchRemoteUploadImageUncached(publicPath)
    .catch(() => null)
    .then((image) => {
      if (!image) {
        missingRemoteImages.set(publicPath, Date.now() + NEGATIVE_CACHE_TTL_MS);
        if (missingRemoteImages.size > MAX_NEGATIVE_CACHE_ENTRIES) {
          const oldestKey = missingRemoteImages.keys().next().value;
          if (oldestKey) missingRemoteImages.delete(oldestKey);
        }
      }
      return image;
    })
    .finally(() => remoteImageRequests.delete(publicPath));
  remoteImageRequests.set(publicPath, request);
  return request;
}

function imageHeaders(input: {
  cacheControl: string;
  contentLength: number;
  contentType: string;
  etag?: string;
  lastModified?: Date;
}) {
  return {
    "Cache-Control": input.cacheControl,
    "Content-Length": input.contentLength.toString(),
    "Content-Type": input.contentType,
    "X-Content-Type-Options": "nosniff",
    ...(input.etag ? { ETag: input.etag } : {}),
    ...(input.lastModified
      ? { "Last-Modified": input.lastModified.toUTCString() }
      : {}),
  };
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  const respond = <T extends Response>(response: T) =>
    attachRequestId(response, requestId);
  const publicPath = request.nextUrl.searchParams.get("path");

  if (!publicPath) {
    return respond(new NextResponse("Missing image path", { status: 400 }));
  }

  let normalizedPublicPath: string;
  try {
    normalizedPublicPath = normalizeUploadPath(publicPath);
  } catch {
    return respond(new NextResponse("Invalid image path", { status: 400 }));
  }

  try {
    const filePath = uploadPathToFilePath(normalizedPublicPath);
    const contentType = getMimeType(filePath);
    if (!contentType.startsWith("image/")) {
      return respond(
        new NextResponse("Unsupported image type", { status: 415 }),
      );
    }

    const fileHandle = await open(/* turbopackIgnore: true */ filePath, "r");
    try {
      const fileStat = await fileHandle.stat();
      if (!fileStat.isFile()) {
        return respond(new NextResponse("Image not found", { status: 404 }));
      }

      const etag = createWeakFileEtag(fileStat.size, fileStat.mtimeMs);
      if (
        matchesHttpCacheValidators({
          headers: request.headers,
          etag,
          lastModified: fileStat.mtime,
        })
      ) {
        return respond(
          new NextResponse(null, {
            status: 304,
            headers: {
              "Cache-Control": LOCAL_IMAGE_CACHE_CONTROL,
              ETag: etag,
              "Last-Modified": fileStat.mtime.toUTCString(),
              "X-Content-Type-Options": "nosniff",
            },
          }),
        );
      }

      const file = await fileHandle.readFile();
      return respond(
        new NextResponse(file, {
          headers: imageHeaders({
            cacheControl: LOCAL_IMAGE_CACHE_CONTROL,
            contentLength: file.byteLength,
            contentType,
            etag,
            lastModified: fileStat.mtime,
          }),
        }),
      );
    } finally {
      await fileHandle.close();
    }
  } catch (localError) {
    if (normalizedPublicPath.startsWith("/uploads/")) {
      try {
        const remoteImage = await fetchRemoteUploadImage(normalizedPublicPath);
        if (remoteImage) {
          structuredLog("warn", "image.source.remote_fallback", {
            requestId,
            path: normalizedPublicPath,
          });
          return respond(
            new NextResponse(new Uint8Array(remoteImage.file), {
              headers: imageHeaders({
                cacheControl: "public, max-age=3600, stale-if-error=86400",
                contentLength: remoteImage.file.byteLength,
                contentType: remoteImage.contentType,
              }),
            }),
          );
        }
      } catch (remoteError) {
        structuredLog("error", "image.source.remote_failed", {
          requestId,
          path: normalizedPublicPath,
          error: remoteError,
        });
      }
    }

    structuredLog("warn", "image.source.not_found", {
      requestId,
      path: normalizedPublicPath,
      error: localError,
    });
    return respond(
      new NextResponse("Image not found", {
        status: 404,
        headers: {
          "Cache-Control": "public, max-age=60",
          "X-Content-Type-Options": "nosniff",
        },
      }),
    );
  }
}
