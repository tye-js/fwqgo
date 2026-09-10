type RequestBodySource = Pick<Request, "body" | "headers">;

export class RequestBodyTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes`);
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readRequestBodyWithLimit(
  request: RequestBodySource,
  maxBytes: number,
) {
  const configuredLimit = Math.trunc(maxBytes);
  const limit = Number.isFinite(configuredLimit)
    ? Math.max(1, configuredLimit)
    : 1;
  const declaredLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new RequestBodyTooLargeError(limit);
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > limit) {
        await reader
          .cancel("Request body exceeds configured limit")
          .catch(() => undefined);
        throw new RequestBodyTooLargeError(limit);
      }

      chunks.push(value);
    }

    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  } finally {
    reader.releaseLock();
  }
}

export async function readRequestTextWithLimit(
  request: RequestBodySource,
  maxBytes: number,
) {
  return new TextDecoder().decode(
    await readRequestBodyWithLimit(request, maxBytes),
  );
}

/** Bound the entire multipart envelope, including fields and unused files. */
export async function readRequestFormDataWithLimit(
  request: RequestBodySource,
  maxBytes: number,
) {
  const body = await readRequestBodyWithLimit(request, maxBytes);
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  return new Response(body, { headers }).formData();
}
