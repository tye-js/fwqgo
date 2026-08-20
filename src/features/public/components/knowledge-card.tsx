import Link from "next/link";
import { ArrowRight, Layers3, Lightbulb } from "lucide-react";

import type { PublicKnowledgeLanguage } from "@/features/public/data/knowledge";

export type KnowledgeCardItem = {
  id: number;
  title: string;
  slug: string;
  definition: string | null;
  highlights: string[] | null;
  quickTip: string | null;
  keywords: string | null;
  categoryName: string;
  contentUpdatedAt: Date;
};

function splitKeywords(value: string | null) {
  return (value ?? "")
    .split(/[,，、;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function formatKnowledgeDate(value: Date, language: PublicKnowledgeLanguage) {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function inlineCode(value: string) {
  return value.split(/(`[^`]+`)/g).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") ? (
      <code
        key={`${part}-${index}`}
        className="rounded bg-background/80 px-1 py-0.5 font-mono text-[0.92em] text-foreground"
      >
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

function highlightParts(value: string) {
  const match = /^\*\*(.+?)\*\*\s*([：:])?\s*(.*)$/s.exec(value);
  if (!match) return null;
  return {
    label: match[1]?.trim() ?? "",
    description: match[3]?.trim() ?? "",
  };
}

function textOrFallback(value: string | null, fallback: string) {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  return normalized;
}

export function KnowledgeCard({
  item,
  language,
  href,
  fallbackDefinition,
  viewLabel,
}: {
  item: KnowledgeCardItem;
  language: PublicKnowledgeLanguage;
  href: string;
  fallbackDefinition: string;
  viewLabel: string;
}) {
  const keywords = splitKeywords(item.keywords);
  const highlights = (item.highlights ?? []).slice(0, 3);
  const definition = textOrFallback(item.definition, fallbackDefinition);

  return (
    <article className="flex min-h-72 flex-col rounded-lg border border-border/70 bg-background p-5 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/35 hover:shadow-md">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 flex-1 items-start gap-1.5 break-words font-medium text-primary">
          <Layers3 className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="break-words">{item.categoryName}</span>
        </span>
        <time
          className="shrink-0 whitespace-nowrap"
          dateTime={item.contentUpdatedAt.toISOString()}
        >
          {formatKnowledgeDate(item.contentUpdatedAt, language)}
        </time>
      </div>

      <h3 className="mt-3 text-lg font-semibold leading-7 tracking-normal">
        <Link
          href={href}
          className="break-words rounded-sm outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {item.title}
        </Link>
      </h3>

      <p className="mt-2 text-sm font-medium leading-6 text-foreground/85">
        {definition}
      </p>

      {highlights.length > 0 ? (
        <ul className="mt-4 space-y-2.5 text-sm leading-5 text-muted-foreground">
          {highlights.map((highlight, index) => {
            const parts = highlightParts(highlight);
            return (
              <li
                key={`${item.id}-${index}`}
                className="grid grid-cols-[6px_minmax(0,1fr)] gap-2.5"
              >
                <span
                  className="mt-[0.45rem] size-1.5 rounded-full bg-primary/75"
                  aria-hidden="true"
                />
                <span>
                  {parts ? (
                    <>
                      <strong className="font-semibold text-foreground">
                        {parts.label}
                      </strong>
                      {parts.description ? (
                        <>：{inlineCode(parts.description)}</>
                      ) : null}
                    </>
                  ) : (
                    inlineCode(highlight)
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {item.quickTip?.trim() ? (
        <div className="mt-4 flex gap-2 rounded-md border-l-2 border-primary bg-muted/45 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
          <Lightbulb
            className="mt-0.5 size-3.5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <span className="min-w-0 break-words">{inlineCode(item.quickTip)}</span>
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5">
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((keyword) => (
            <span
              key={keyword}
              className="rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground"
            >
              {keyword}
            </span>
          ))}
        </div>
        <Link
          href={href}
          className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {viewLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
