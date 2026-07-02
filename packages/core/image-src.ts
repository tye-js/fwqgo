const DEFAULT_SITE_URL = "https://fwqgo.com";

export function isRenderableImageSrc(
  src: string | null | undefined,
): src is string {
  if (!src) return false;

  if (src.startsWith("/")) {
    return !src.startsWith("//");
  }

  try {
    const url = new URL(src);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getImageSrc(src: string) {
  if (!src.startsWith("/uploads/")) {
    return src;
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_URL?.replace(/\/$/, "") ?? DEFAULT_SITE_URL;

  return `${baseUrl}${src}`;
}

export function getOptimizedImageSrc(src: string) {
  if (!src.startsWith("/uploads/")) {
    return src;
  }

  return `/api/images/source?path=${encodeURIComponent(src)}`;
}
