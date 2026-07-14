import { isIP } from "node:net";

type HeaderReader = Pick<Headers, "get">;

function normalizeIp(value: string | null | undefined) {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 64) return null;

  const unwrapped =
    candidate.startsWith("[") && candidate.endsWith("]")
      ? candidate.slice(1, -1)
      : candidate;

  return isIP(unwrapped) > 0 ? unwrapped : null;
}

export function getTrustedClientIp(headers: HeaderReader) {
  const realIp = normalizeIp(headers.get("x-real-ip"));
  if (realIp) return realIp;

  const connectingIp = normalizeIp(headers.get("cf-connecting-ip"));
  if (connectingIp) return connectingIp;

  const forwardedFor = headers.get("x-forwarded-for");
  if (!forwardedFor) return null;

  const proxyAdjacentIp = forwardedFor
    .split(",")
    .map((value) => normalizeIp(value))
    .filter((value): value is string => Boolean(value))
    .at(-1);

  return proxyAdjacentIp ?? null;
}
