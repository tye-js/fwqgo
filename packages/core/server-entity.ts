export type ServerEntity = {
  id: number;
  slug: string | null;
  name: string;
  enName?: string | null;
  aliases?: string | null;
};

export function isCanonicalServerEntitySlug(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function normalizeServerEntityAlias(value: string) {
  return value
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

export function resolveServerEntity<T extends ServerEntity>(
  entities: T[],
  value: string,
): (T & { slug: string }) | null {
  const trusted = entities.filter((entity): entity is T & { slug: string } =>
    isCanonicalServerEntitySlug(entity.slug),
  );
  const exact = trusted.find((entity) => entity.slug === value);
  if (exact) return exact;
  const alias = normalizeServerEntityAlias(value);
  if (!alias) return null;
  const matches = trusted.filter((entity) =>
    [
      entity.slug,
      entity.name,
      entity.enName,
      ...(entity.aliases?.split(/[,，;；|\n]+/) ?? []),
    ].some((name) => name && normalizeServerEntityAlias(name) === alias),
  );
  // Ambiguous names must not choose an arbitrary merchant or region.
  return matches.length === 1 ? matches[0]! : null;
}
