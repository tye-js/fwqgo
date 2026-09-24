import Link from "next/link";
import { ArrowRight, CalendarDays, Layers } from "lucide-react";

import { SafePostImage } from "@/features/public/components/safe-post-image";
import { type PostWithTags } from "@/types";
import { DISPLAY_TIME_ZONE } from "@fwqgo/core/display-time-zone";

function formatCardDate(value: Date | string, locale: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

/**
 * 文末「同分类文章」卡片区。
 *
 * 与右栏的「相关文章」互补：右栏按标签/内链匹配，这里按分类取最新，
 * 保证标签很少的新文章也能落到三张有封面的卡片上。
 */
export function ArticleCategoryPosts({
  posts,
  language = "zh",
  categoryName,
  categoryHref,
  limit = 3,
}: {
  posts: PostWithTags[];
  language?: "zh" | "en";
  categoryName: string;
  categoryHref: string;
  limit?: number;
}) {
  const visiblePosts = posts.slice(0, limit);
  if (visiblePosts.length === 0) return null;

  const postPrefix = language === "en" ? "/en/fwq/posts" : "/fwq/posts";
  const locale = language === "en" ? "en-US" : "zh-CN";

  return (
    <section
      className="border-t border-border/70 pt-5"
      aria-label={language === "en" ? "More in this category" : "同分类文章"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          <Layers className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {language === "en" ? "More in this category" : "同分类文章"}
        </div>
        <Link
          href={categoryHref}
          prefetch={false}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {language === "en" ? `All ${categoryName}` : `全部「${categoryName}」`}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visiblePosts.map((post) => (
          <Link
            key={post.id}
            href={`${postPrefix}/${encodeURIComponent(post.slug)}`}
            prefetch={false}
            className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="relative block aspect-[16/9] w-full overflow-hidden bg-muted">
              <SafePostImage
                src={post.imgUrl}
                alt={post.title}
                sizes="(max-width: 639px) calc(100vw - 4rem), (max-width: 1023px) 45vw, 240px"
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-2 p-3.5">
              <span className="line-clamp-2 text-sm font-semibold leading-6 text-foreground underline-offset-4 transition-colors group-hover:text-primary group-hover:underline">
                {post.title}
              </span>
              <span className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
                {formatCardDate(post.createdAt, locale)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
