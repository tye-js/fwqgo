import { NextResponse } from "next/server";

import { readOutboundShortTarget } from "@/server/links/outbound-short-link";

const NO_INDEX_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const targetUrl = await readOutboundShortTarget(token);

  if (!targetUrl) {
    return new NextResponse("Invalid outbound link", {
      status: 404,
      headers: NO_INDEX_HEADERS,
    });
  }

  return NextResponse.redirect(targetUrl, {
    status: 302,
    headers: NO_INDEX_HEADERS,
  });
}
