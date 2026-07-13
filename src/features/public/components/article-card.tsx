import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";

import { type PostWithTags } from "@/types";
import { SafePostImage } from "@/features/public/components/safe-post-image";

function formatArticleDate(value: Date | string, locale: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function ArticleCard({
  post,
  language = "zh",
}: {
  post: PostWithTags;
  language?: "zh" | "en";
}) {
  const postPrefix = language === "en" ? "/en/fwq/posts" : "/fwq/posts";
  const tagPrefix = language === "en" ? "/en/fwq/tags" : "/fwq/tags";
  const href = `${postPrefix}/${encodeURIComponent(post.slug)}`;
  const locale = language === "en" ? "en-US" : "zh-CN";
  const titleId = `article-card-title-${post.id}`;
  const primaryTag = post.tags[0]?.tag;
  const secondaryTags = post.tags.slice(1, 4);
  const copy = {
    imageLabel:
      language === "en" ? `Read article: ${post.title}` : `阅读文章：${post.title}`,
    fallbackDescription:
      language === "en"
        ? "Read the full review, deal details, and use cases."
        : "查看详细测评、优惠信息与适用场景。",
    readMore: language === "en" ? "Read article" : "阅读全文",
  };

  return (
    <article
      aria-labelledby={titleId}
      data-testid="article-card"
      className="group overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/35 hover:bg-muted/15 hover:shadow-md"
    >
      <div className="grid min-w-0 md:grid-cols-[224px_minmax(0,1fr)] lg:grid-cols-[232px_minmax(0,1fr)]">
        <Link
          href={href}
          prefetch
          aria-label={copy.imageLabel}
          className="relative aspect-[16/9] overflow-hidden border-b border-border/60 bg-muted focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:m-3 md:mr-0 md:self-center md:rounded-md md:border"
        >
          <SafePostImage
            src={post.imgUrl}
            alt={post.title}
            sizes="(max-width: 767px) calc(100vw - 2rem), 232px"
          />
        </Link>

        <div className="flex min-w-0 flex-col px-4 py-4 md:min-h-[150px] md:px-5 md:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {primaryTag ? (
              <Link
                href={`${tagPrefix}/${encodeURIComponent(primaryTag.slug)}/page/1`}
                prefetch
                className="relative z-10 inline-flex min-h-11 items-center gap-1.5 rounded-sm font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-8"
              >
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                {primaryTag.name}
              </Link>
            ) : null}
            <span className="inline-flex min-h-8 items-center gap-1.5 tabular-nums">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {formatArticleDate(post.createdAt, locale)}
            </span>
          </div>

          <Link
            href={href}
            prefetch
            className="mt-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <h3
              id={titleId}
              className="font-editorial line-clamp-2 text-lg font-semibold leading-7 text-foreground underline-offset-4 transition-colors group-hover:text-primary group-hover:underline"
            >
              {post.title}
            </h3>
          </Link>

          <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {post.description ?? copy.fallbackDescription}
          </p>

          <div className="mt-auto flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2 pt-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              {secondaryTags.map((tag) => (
                <Link
                  key={tag.tag.id}
                  href={`${tagPrefix}/${encodeURIComponent(tag.tag.slug)}/page/1`}
                  prefetch
                  className="relative z-10 inline-flex min-h-11 items-center text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-8"
                >
                  #{tag.tag.name}
                </Link>
              ))}
            </div>

            <Link
              href={href}
              prefetch
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm text-sm font-semibold text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {copy.readMore}
              <ArrowRight
                className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export default ArticleCard;
