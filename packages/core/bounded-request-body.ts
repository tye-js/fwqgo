type RequestBodySource = Pick<Request, "body" | "headers">;

export class RequestBodyTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes`);
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readRequestTextWithLimit(
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

  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

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

      text += decoder.decode(value, { stream: true });
    }

    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
