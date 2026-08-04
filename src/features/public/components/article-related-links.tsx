import Link from "next/link";
import { ArrowRight, BookOpenText, SquareLibrary } from "lucide-react";

import type { PublicArticleInternalLink } from "@/server/posts/internal-links";

export function ArticleRelatedKnowledge({
  links,
  language = "zh",
}: {
  links: PublicArticleInternalLink[];
  language?: "zh" | "en";
}) {
  if (links.length === 0) return null;

  return (
    <section className="border-t border-border/70 pt-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <BookOpenText className="size-4 text-primary" aria-hidden="true" />
        {language === "en" ? "Related knowledge" : "相关知识"}
      </div>
      <div className="mt-2 divide-y divide-border/60">
        {links.map((link) => (
          <Link
            key={link.id}
            href={link.href}
            prefetch
            className="group flex min-h-11 items-center justify-between gap-3 py-2 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span>{link.title}</span>
            <ArrowRight
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function ArticleRelatedSidebar({
  links,
  language = "zh",
}: {
  links: PublicArticleInternalLink[];
  language?: "zh" | "en";
}) {
  if (links.length === 0) return null;

  return (
    <aside className="border-t border-border/70 pt-6 xl:sticky xl:top-20 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <SquareLibrary className="size-4 text-primary" aria-hidden="true" />
        {language === "en" ? "Related articles" : "相关文章"}
      </div>
      <div className="mt-2 divide-y divide-border/60">
        {links.map((link) => (
          <Link
            key={link.id}
            href={link.href}
            prefetch
            className="group flex min-h-14 items-center justify-between gap-3 py-2.5 text-sm font-medium leading-5 text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="line-clamp-2">{link.title}</span>
            <ArrowRight
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </aside>
  );
}
