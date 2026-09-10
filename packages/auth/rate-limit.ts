import { getTrustedClientIp } from "@fwqgo/core/client-ip";

/** Account limits remain effective even when a request has no trusted IP. */
export function getAuthRateLimitKeys(
  headers: Pick<Headers, "get">,
  username: string,
) {
  const keys = [`user:${username.trim().toLowerCase()}`];
  const ip = getTrustedClientIp(headers);
  if (ip) keys.push(`ip:${ip}`);
  return keys;
}
