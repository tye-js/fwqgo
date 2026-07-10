import { readFile, stat } from "node:fs/promises";

import {
  normalizeUploadPath,
  uploadPathToFilePath,
} from "@/server/images/assets";
import { type NextRequest, NextResponse } from "next/server";

const DEFAULT_PUBLIC_ORIGIN = "https://fwqgo.com";
const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024;
const REMOTE_UPLOAD_HOSTS = new Set(["fwqgo.com", "cms.fwqgo.com"]);

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

async function fetchRemoteUploadImage(publicPath: string) {
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

    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (!contentType?.startsWith("image/")) {
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

    const file = Buffer.from(await response.arrayBuffer());
    if (file.byteLength > MAX_REMOTE_IMAGE_BYTES) {
      continue;
    }

    return new NextResponse(file, {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Length": file.byteLength.toString(),
        "Content-Type": contentType,
      },
    });
  }

  return null;
}

export async function GET(request: NextRequest) {
  const publicPath = request.nextUrl.searchParams.get("path");

  if (!publicPath) {
    return new NextResponse("Missing image path", { status: 400 });
  }

  let normalizedPublicPath: string;
  try {
    normalizedPublicPath = normalizeUploadPath(publicPath);
  } catch {
    return new NextResponse("Invalid image path", { status: 400 });
  }

  try {
    const filePath = uploadPathToFilePath(normalizedPublicPath);
    const contentType = getMimeType(filePath);
    if (!contentType.startsWith("image/")) {
      return new NextResponse("Unsupported image type", { status: 415 });
    }

    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      return new NextResponse("Image not found", { status: 404 });
    }

    const file = await readFile(filePath);

    return new NextResponse(file, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": fileStat.size.toString(),
        "Content-Type": contentType,
      },
    });
  } catch {
    if (normalizedPublicPath.startsWith("/uploads/")) {
      try {
        const remoteImage = await fetchRemoteUploadImage(normalizedPublicPath);
        if (remoteImage) return remoteImage;
      } catch {
        // Fall through to the normal 404 response.
      }
    }

    return new NextResponse("Image not found", { status: 404 });
  }
}
