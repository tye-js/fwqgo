import { NextResponse } from "next/server";

import { readOutboundShortTarget } from "@/server/links/outbound-short-link";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const targetUrl = await readOutboundShortTarget(token);

  if (!targetUrl) {
    return new NextResponse("Invalid outbound link", { status: 404 });
  }

  return NextResponse.redirect(targetUrl, 302);
}
