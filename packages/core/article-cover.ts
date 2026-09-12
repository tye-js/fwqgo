export const DEFAULT_ARTICLE_COVER = "/img/placeholders/fwq-placeholder.png";

export function isDefaultArticleCover(value: string | null | undefined) {
  return !value?.trim() || value.trim() === DEFAULT_ARTICLE_COVER;
}
