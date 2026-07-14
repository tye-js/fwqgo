export function createWeakFileEtag(size: number, modifiedAtMs: number) {
  return `W/\"${size.toString(16)}-${Math.trunc(modifiedAtMs).toString(16)}\"`;
}

export function matchesHttpCacheValidators(input: {
  headers: Headers;
  etag: string;
  lastModified: Date;
}) {
  const ifNoneMatch = input.headers.get("if-none-match");
  if (ifNoneMatch) {
    return ifNoneMatch
      .split(",")
      .map((value) => value.trim())
      .some((value) => value === "*" || value === input.etag);
  }

  const ifModifiedSince = input.headers.get("if-modified-since");
  if (!ifModifiedSince) return false;
  const since = Date.parse(ifModifiedSince);
  if (!Number.isFinite(since)) return false;
  return (
    Math.trunc(input.lastModified.getTime() / 1_000) <=
    Math.trunc(since / 1_000)
  );
}
