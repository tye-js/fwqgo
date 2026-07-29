import Link from "next/link";
import { BookOpenText, ChevronRight } from "lucide-react";

export type KnowledgeQuickCategory = {
  id: number;
  name: string;
  description: string | null;
  articleCount: number;
  href: string;
};

export function KnowledgeCategoryQuickReference({
  title,
  description,
  countLabel,
  categories,
}: {
  title: string;
  description: string;
  countLabel: (count: number) => string;
  categories: KnowledgeQuickCategory[];
}) {
  return (
    <section aria-labelledby="knowledge-category-quick-title">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <BookOpenText className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2
            id="knowledge-category-quick-title"
            className="text-lg font-semibold tracking-normal"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={category.href}
            className="group flex min-h-28 items-start justify-between gap-3 rounded-lg border border-border/70 bg-background p-4 outline-none transition-[border-color,box-shadow] duration-200 hover:border-primary/35 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground group-hover:text-primary">
                {category.name}
              </span>
              <span className="mt-1.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                {category.description}
              </span>
              <span className="mt-2 block text-xs font-medium text-primary">
                {countLabel(category.articleCount)}
              </span>
            </span>
            <ChevronRight
              className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
