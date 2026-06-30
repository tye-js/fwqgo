import { readFile, stat } from "node:fs/promises";

import { uploadPathToFilePath } from "@/server/images/assets";
import { type NextRequest, NextResponse } from "next/server";

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

export async function GET(request: NextRequest) {
  const publicPath = request.nextUrl.searchParams.get("path");

  if (!publicPath) {
    return new NextResponse("Missing image path", { status: 400 });
  }

  try {
    const filePath = uploadPathToFilePath(publicPath);
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      return new NextResponse("Image not found", { status: 404 });
    }

    const file = await readFile(filePath);

    return new NextResponse(file, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": fileStat.size.toString(),
        "Content-Type": getMimeType(filePath),
      },
    });
  } catch {
    return new NextResponse("Image not found", { status: 404 });
  }
}
