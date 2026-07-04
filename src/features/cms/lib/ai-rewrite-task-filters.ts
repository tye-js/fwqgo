export const aiRewriteTaskStatusFilters = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "manual_required",
] as const;

export const aiRewriteTaskSourceTypeFilters = [
  "url",
  "text",
  "email",
  "file",
  "english",
  "seo",
] as const;

export type AiRewriteTaskStatusFilter =
  | "all"
  | (typeof aiRewriteTaskStatusFilters)[number];
export type AiRewriteTaskSourceTypeFilter =
  | "all"
  | (typeof aiRewriteTaskSourceTypeFilters)[number];
export type AiRewriteTaskLanguageFilter = "all" | "zh" | "en";

export type AiRewriteTaskListFilters = {
  pageNo?: number;
  pageSize?: number;
  status?: AiRewriteTaskStatusFilter;
  sourceType?: AiRewriteTaskSourceTypeFilter;
  language?: AiRewriteTaskLanguageFilter;
  query?: string;
};
