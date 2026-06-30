const DEFAULT_SITE_URL = "https://fwqgo.com";

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
