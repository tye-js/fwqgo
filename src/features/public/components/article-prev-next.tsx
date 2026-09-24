import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

type NavigationPost = {
  id: number;
  title: string;
  slug: string;
};

/**
 * 上下篇导航。
 *
 * 按 `id` 相邻取文，不是按发布时间——发布时间可以被补录，用 id 才是稳定的阅读顺序。
 * 两侧都取不到时整段不渲染。
 */
export function ArticlePrevNext({
  previous,
  next,
  language = "zh",
}: {
  previous: NavigationPost | null;
  next: NavigationPost | null;
  language?: "zh" | "en";
}) {
  if (!previous && !next) return null;

  const postPrefix = language === "en" ? "/en/fwq/posts" : "/fwq/posts";
  const copy =
    language === "en"
      ? { previous: "Previous article", next: "Next article" }
      : { previous: "上一篇", next: "下一篇" };

  const cardClassName =
    "group flex min-h-20 min-w-0 flex-col justify-center gap-1.5 rounded-xl border border-border/80 bg-card px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <section
      className="border-t border-border/70 pt-5"
      aria-label={language === "en" ? "Article navigation" : "上下篇导航"}
    >
      <div
        className={`grid gap-3 ${previous && next ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}
      >
        {previous ? (
          <Link
            href={`${postPrefix}/${encodeURIComponent(previous.slug)}`}
            prefetch={false}
            className={cardClassName}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ArrowLeft
                className="size-3.5 shrink-0 transition-transform group-hover:-translate-x-0.5"
                aria-hidden="true"
              />
              {copy.previous}
            </span>
            <span className="break-words text-sm font-semibold leading-6 text-foreground transition-colors group-hover:text-primary">
              {previous.title}
            </span>
          </Link>
        ) : null}
        {next ? (
          <Link
            href={`${postPrefix}/${encodeURIComponent(next.slug)}`}
            prefetch={false}
            className={`${cardClassName} sm:text-right`}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground sm:justify-end">
              {copy.next}
              <ArrowRight
                className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
            <span className="break-words text-sm font-semibold leading-6 text-foreground transition-colors group-hover:text-primary">
              {next.title}
            </span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
