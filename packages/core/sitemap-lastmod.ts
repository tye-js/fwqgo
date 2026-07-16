export type SitemapLastmodValue = Date | string | number | null | undefined;

export function formatSitemapLastmod(value: SitemapLastmodValue) {
  if (value === null || value === undefined) return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function renderSitemapLastmod(value: SitemapLastmodValue) {
  const formatted = formatSitemapLastmod(value);
  return formatted ? `<lastmod>${formatted}</lastmod>` : "";
}
