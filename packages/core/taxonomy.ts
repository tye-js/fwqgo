function nonEmptyTrim(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

export function resolveEnglishTagIdentity(tag: {
  name: string;
  slug: string;
  enName?: string | null;
  enSlug?: string | null;
}) {
  const fallbackName = /\p{Script=Han}/u.test(tag.name)
    ? undefined
    : nonEmptyTrim(tag.name);
  const fallbackSlug = /^[a-z0-9-]+$/i.test(tag.slug)
    ? nonEmptyTrim(tag.slug)
    : undefined;
  const name = nonEmptyTrim(tag.enName) ?? fallbackName;
  const slug = nonEmptyTrim(tag.enSlug) ?? fallbackSlug;

  return name && slug ? { name, slug } : null;
}
