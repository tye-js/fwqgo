import { connection, NextResponse } from "next/server";

import { isUnauthorizedError, requireAdminSession } from "@fwqgo/auth/session";

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    },
  });
}

export async function GET() {
  await connection();

  try {
    await requireAdminSession();
    return noStoreJson({ releaseId: process.env.RELEASE_ID ?? "local" });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return noStoreJson({ error: "unauthorized" }, 401);
    }

    console.error("Failed to read CMS release:", error);
    return noStoreJson({ error: "unavailable" }, 503);
  }
}
