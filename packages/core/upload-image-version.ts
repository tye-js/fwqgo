/** Update references to one local upload while preserving other URL parameters. */
export function versionUploadImageReferences(
  content: string,
  publicPath: string,
  revision: string,
  siteUrl: string,
) {
  const origin = new URL(siteUrl).origin;
  const escapedPath = publicPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:https?:\\/\\/[^/\\s\"'<>]+)?${escapedPath}(?=$|[?#\\s\"'<>\\)\\]])(?:\\?[^\\s\"'<>\\)\\]#]*)?(?:#[^\\s\"'<>\\)\\]]*)?`,
    "g",
  );
  return content.replace(pattern, (candidate: string, offset: number) => {
    const absolute = /^https?:/i.test(candidate);
    if (!absolute && offset > 0 && /[a-z0-9_./%-]/i.test(content[offset - 1]!))
      return candidate;
    try {
      const encodedAmpersands = candidate.includes("&amp;");
      const url = new URL(candidate.replaceAll("&amp;", "&"), origin);
      if (url.origin !== origin || url.pathname !== publicPath)
        return candidate;
      url.searchParams.set("v", revision);
      const result = absolute
        ? url.href
        : `${url.pathname}${url.search}${url.hash}`;
      return encodedAmpersands ? result.replaceAll("&", "&amp;") : result;
    } catch {
      return candidate;
    }
  });
}
