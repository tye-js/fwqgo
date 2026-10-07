import Link from "@/features/public/components/public-link";
import { ArrowRight, CalendarDays } from "lucide-react";

import { type PostWithTags } from "@/types";
import { SafePostImage } from "@/features/public/components/safe-post-image";
import { cn } from "@fwqgo/core/utils";
import { DISPLAY_TIME_ZONE } from "@fwqgo/core/display-time-zone";

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

  if (!tag.publiclyIndexable || !tag.slug.trim()) {
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
    timeZone: DISPLAY_TIME_ZONE,
  });
}

/**
 * home-list 使用 80 / 144px 的固定缩略图；旧 feature 保留原有图文分栏尺寸。
 * compact 始终使用缩略图：窄屏 88px 列减去 12px 边距，sm 起为 112px 列。
 * 列表页维持原有 md/lg 图片尺寸。调整栅格时同步更新 verify:public-images。
 */
function cardImageSizes(variant: "list" | "feature" | "compact" | "home-list") {
  if (variant === "home-list") {
    return "(max-width: 639px) 80px, 144px";
  }
  if (variant === "feature") {
    return "(max-width: 639px) calc(100vw - 2rem), (max-width: 1279px) 46vw, 408px";
  }
  if (variant === "compact") {
    return "(max-width: 639px) 76px, 100px";
  }
  return "(max-width: 767px) calc(100vw - 2rem), 232px";
}

function ArticleCard({
  post,
  language = "zh",
  excludedTagSlug,
  variant = "list",
  headingLevel = 3,
  priority,
}: {
  post: PostWithTags;
  language?: "zh" | "en";
  excludedTagSlug?: string;
  variant?: "list" | "feature" | "compact" | "home-list";
  /**
   * 标题层级。默认 `3` —— 首页的卡片在 `h2` 区块里，`h3` 是对的。
   *
   * 但**列表页**（分类 / 标签 / 全部文章 / 搜索）只有 `PageCard` 的 `h1`，卡片直接跟在
   * 它后面，`h3` 会跳级（实测 142 页被 a11y 审计标为 `h1 → h3`）。那里传 `2`。
   */
  headingLevel?: 2 | 3;
  priority?: boolean;
}) {
  const postPrefix = language === "en" ? "/en/fwq/posts" : "/fwq/posts";
  const tagPrefix = language === "en" ? "/en/fwq/tags" : "/fwq/tags";
  // 动态标签名：`h2` / `h3` 的 props 完全一致，用联合类型即可。
  const Heading = headingLevel === 2 ? "h2" : "h3";
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

  if (variant === "home-list") {
    const date = formatArticleDate(post.createdAt, locale);
    return (
      <article
        aria-labelledby={titleId}
        data-testid="article-card"
        data-variant="home-list"
        className="grid min-w-0 grid-cols-[80px_minmax(0,1fr)] items-start gap-x-3 border-b border-border/70 py-4 first:pt-0 last:border-0 sm:grid-cols-[144px_minmax(0,1fr)] sm:gap-x-5 sm:py-5"
      >
        <Link
          href={href}
          aria-label={copy.imageLabel}
          className="relative block aspect-[4/3] overflow-hidden rounded-md bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:aspect-[8/5]"
        >
          <SafePostImage
            src={post.imgUrl}
            alt={post.title}
            sizes={cardImageSizes(variant)}
            priority={priority ?? false}
          />
        </Link>
        <div className="min-w-0">
          <Link
            href={href}
            className="flex min-h-11 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Heading
              id={titleId}
              className="font-editorial break-words text-base font-semibold leading-6 text-foreground [overflow-wrap:anywhere] hover:text-primary sm:text-lg sm:leading-7"
            >
              {post.title}
            </Heading>
          </Link>
          {post.description?.trim() ? (
            <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-muted-foreground">
              {post.description}
            </p>
          ) : null}
          {date ? (
            <time
              dateTime={new Date(post.createdAt).toISOString()}
              className="mt-2 block text-xs tabular-nums text-muted-foreground"
            >
              {date}
            </time>
          ) : null}
        </div>
        {visibleTags.length > 0 ? (
          <div className="col-span-2 flex min-w-0 flex-wrap gap-x-3 break-words text-xs [overflow-wrap:anywhere] sm:col-span-1 sm:col-start-2 [&_a]:min-w-11 [&_a]:max-w-full">
            {visibleTags.slice(0, 3).map(({ tag }) => (
              <ArticleTagLabel key={tag.id} tag={tag} tagPrefix={tagPrefix} />
            ))}
          </div>
        ) : null}
      </article>
    );
  }

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
          variant === "feature" &&
            "sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]",
          variant === "compact" &&
            "grid-cols-[88px_minmax(0,1fr)] sm:grid-cols-[112px_minmax(0,1fr)]",
        )}
      >
        <Link
          href={href}
          aria-label={copy.imageLabel}
          className={cn(
            "public-card-image relative aspect-[16/9] overflow-hidden bg-muted focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            variant === "list" &&
              "m-3 mb-0 rounded-xl md:m-4 md:mr-0 md:self-center",
            variant === "feature" &&
              "border-b border-border/60 sm:aspect-auto sm:min-h-56 sm:border-b-0 sm:border-r",
            variant === "compact" &&
              "m-3 mr-0 aspect-square self-center rounded-lg",
          )}
        >
          <SafePostImage
            src={post.imgUrl}
            alt={post.title}
            sizes={cardImageSizes(variant)}
            priority={priority ?? variant === "feature"}
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
            className="mt-1 flex min-h-11 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Heading
              id={titleId}
              className={cn(
                "font-editorial break-words font-semibold text-foreground transition-colors group-hover:text-primary",
                variant === "feature"
                  ? "text-xl leading-snug sm:text-2xl"
                  : "text-lg leading-7",
              )}
            >
              {post.title}
            </Heading>
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
