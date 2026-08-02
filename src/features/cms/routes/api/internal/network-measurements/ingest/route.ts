import { connection, NextResponse } from "next/server";

import {
  ingestNetworkMeasurementBatch,
  NetworkIngestError,
} from "@/server/network-assessment/ingest-service";
import type {
  NetworkPrincipalKind,
  NetworkRequestSignatureHeaders,
} from "@/server/network-assessment/signing";

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  await connection();
  if (
    request.headers.get("content-type")?.split(";", 1)[0] !==
      "application/json" ||
    request.headers.get("content-encoding")
  ) {
    return json({ error: "content_type_required" }, 415);
  }

  const headers: NetworkRequestSignatureHeaders = {
    principalKind: request.headers.get("x-fwqgo-principal-kind") as NetworkPrincipalKind,
    principalExternalId: request.headers.get("x-fwqgo-principal-id") ?? "",
    keyId: request.headers.get("x-fwqgo-key-id") ?? "",
    requestTimestamp: request.headers.get("x-fwqgo-timestamp") ?? "",
    nonce: request.headers.get("x-fwqgo-nonce") ?? "",
    signature: request.headers.get("x-fwqgo-signature") ?? "",
  };

  try {
    const body = new Uint8Array(await request.arrayBuffer());
    const result = await ingestNetworkMeasurementBatch({
      method: request.method,
      path: new URL(request.url).pathname,
      headers,
      body,
    });
    return json(result, 202);
  } catch (error) {
    if (error instanceof NetworkIngestError) {
      return json({ error: error.code }, error.status);
    }
    console.error("Network measurement ingest failed:", error);
    return json({ error: "ingest_unavailable" }, 503);
  }
}
