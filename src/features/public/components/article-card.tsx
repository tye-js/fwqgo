import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";

import { type PostWithTags } from "@/types";
import { SafePostImage } from "@/features/public/components/safe-post-image";
import { cn } from "@fwqgo/core/utils";

type ArticleCardTag = PostWithTags["tags"][number]["tag"];

function ArticleTagLabel({
  tag,
  tagPrefix,
  primary = false,
}: {
  tag: ArticleCardTag;
  tagPrefix: string;
  primary?: boolean;
}) {
  const content = primary ? (
    <>
      <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
      {tag.name}
    </>
  ) : (
    <>#{tag.name}</>
  );
  const className = primary
    ? "relative z-10 inline-flex min-h-11 items-center gap-1.5 rounded-sm font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    : "relative z-10 inline-flex min-h-11 items-center text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  if (!tag.publiclyIndexable) {
    return (
      <span
        className={primary ? className : `${className} pointer-events-none`}
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      href={`${tagPrefix}/${encodeURIComponent(tag.slug)}/page/1`}
      prefetch
      className={className}
    >
      {content}
    </Link>
  );
}

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
  excludedTagSlug,
  variant = "list",
}: {
  post: PostWithTags;
  language?: "zh" | "en";
  excludedTagSlug?: string;
  variant?: "list" | "feature" | "compact";
}) {
  const postPrefix = language === "en" ? "/en/fwq/posts" : "/fwq/posts";
  const tagPrefix = language === "en" ? "/en/fwq/tags" : "/fwq/tags";
  const href = `${postPrefix}/${encodeURIComponent(post.slug)}`;
  const locale = language === "en" ? "en-US" : "zh-CN";
  const titleId = `article-card-title-${post.id}`;
  const visibleTags = excludedTagSlug
    ? post.tags.filter((item) => item.tag.slug !== excludedTagSlug)
    : post.tags;
  const primaryTag = visibleTags[0]?.tag;
  const secondaryTags = visibleTags.slice(1, 4);
  const copy = {
    imageLabel:
      language === "en"
        ? `Read article: ${post.title}`
        : `阅读文章：${post.title}`,
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
      className="public-panel public-card group overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-primary/35 hover:shadow-md"
    >
      <div
        className={cn(
          "grid min-w-0",
          variant === "list" &&
            "md:grid-cols-[224px_minmax(0,1fr)] lg:grid-cols-[232px_minmax(0,1fr)]",
          variant === "compact" && "sm:grid-cols-[112px_minmax(0,1fr)]",
        )}
      >
        <Link
          href={href}
          prefetch
          aria-label={copy.imageLabel}
          className={cn(
            "public-card-image relative aspect-[16/9] overflow-hidden bg-muted focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            variant === "list" &&
              "m-3 mb-0 rounded-xl md:m-4 md:mr-0 md:self-center",
            variant === "feature" &&
              "border-b border-border/60 sm:aspect-[2/1]",
            variant === "compact" &&
              "m-3 mb-0 rounded-lg sm:mb-3 sm:mr-0 sm:aspect-square sm:self-center",
          )}
        >
          <SafePostImage
            src={post.imgUrl}
            alt={post.title}
            sizes={
              variant === "feature"
                ? "(max-width: 767px) calc(100vw - 2rem), (max-width: 1279px) 60vw, 730px"
                : "(max-width: 767px) calc(100vw - 2rem), 232px"
            }
            priority={variant === "feature"}
          />
        </Link>

        <div
          className={cn(
            "flex min-w-0 flex-col p-5",
            variant === "feature" && "sm:p-6",
            variant === "compact" && "p-4",
          )}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {primaryTag ? (
              <ArticleTagLabel tag={primaryTag} tagPrefix={tagPrefix} primary />
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
              className={cn(
                "font-editorial break-words font-semibold text-foreground transition-colors group-hover:text-primary",
                variant === "feature"
                  ? "text-2xl leading-snug sm:text-3xl"
                  : "text-lg leading-7",
              )}
            >
              {post.title}
            </h3>
          </Link>

          <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {post.description ?? copy.fallbackDescription}
          </p>

          <div
            className={cn(
              "mt-auto flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2 pt-3",
              variant === "compact" && "hidden",
            )}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              {secondaryTags.map((tag) => (
                <ArticleTagLabel
                  key={tag.tag.id}
                  tag={tag.tag}
                  tagPrefix={tagPrefix}
                />
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
