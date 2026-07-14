import type { NextResponse } from "next/server";

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

const PRODUCTION_SESSION_COOKIE_NAME = "__Host-fwqgo-cms-session";
const DEVELOPMENT_SESSION_COOKIE_NAME = "fwqgo-cms-session";
const LEGACY_SESSION_COOKIE_NAME = "session_id";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function getCmsSessionCookieName() {
  return isProduction()
    ? PRODUCTION_SESSION_COOKIE_NAME
    : DEVELOPMENT_SESSION_COOKIE_NAME;
}

export function getCmsSessionId(reader: CookieReader) {
  return reader.get(getCmsSessionCookieName())?.value ?? null;
}

export function getCmsSessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    path: "/",
    expires,
    priority: "high" as const,
  };
}

function expireCookie(
  response: NextResponse,
  input: { name: string; path?: string; domain?: string },
) {
  const attributes = [
    input.name + "=",
    "Path=" + (input.path ?? "/"),
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    input.domain ? "Domain=" + input.domain : null,
    isProduction() ? "Secure" : null,
    "HttpOnly",
    "SameSite=Lax",
  ].filter((value): value is string => Boolean(value));

  response.headers.append("Set-Cookie", attributes.join("; "));
}

export function clearLegacyCmsSessionCookies(response: NextResponse) {
  const targets: Array<{ name: string; path: string; domain?: string }> = [
    { name: LEGACY_SESSION_COOKIE_NAME, path: "/" },
    { name: LEGACY_SESSION_COOKIE_NAME, path: "/end" },
  ];

  if (isProduction()) {
    targets.push(
      { name: DEVELOPMENT_SESSION_COOKIE_NAME, path: "/" },
      {
        name: DEVELOPMENT_SESSION_COOKIE_NAME,
        path: "/",
        domain: ".fwqgo.com",
      },
      {
        name: LEGACY_SESSION_COOKIE_NAME,
        path: "/",
        domain: ".fwqgo.com",
      },
      {
        name: LEGACY_SESSION_COOKIE_NAME,
        path: "/end",
        domain: ".fwqgo.com",
      },
    );
  }

  for (const target of targets) {
    expireCookie(response, target);
  }
}

export function clearCmsSessionCookies(response: NextResponse) {
  expireCookie(response, { name: getCmsSessionCookieName() });
  clearLegacyCmsSessionCookies(response);
}
