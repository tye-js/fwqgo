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
 * 首页主文章在 sm 起图文并排（图片占 47.5%），xl 起进入 860px 的首页主栏。
 * compact 始终使用缩略图：窄屏 88px 列减去 12px 边距，sm 起为 112px 列。
 * 列表页维持原有 md/lg 图片尺寸。调整栅格时同步更新 verify:public-images。
 */
function cardImageSizes(variant: "list" | "feature" | "compact") {
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
}: {
  post: PostWithTags;
  language?: "zh" | "en";
  excludedTagSlug?: string;
  variant?: "list" | "feature" | "compact";
  /**
   * 标题层级。默认 `3` —— 首页的卡片在 `h2` 区块里，`h3` 是对的。
   *
   * 但**列表页**（分类 / 标签 / 全部文章 / 搜索）只有 `PageCard` 的 `h1`，卡片直接跟在
   * 它后面，`h3` 会跳级（实测 142 页被 a11y 审计标为 `h1 → h3`）。那里传 `2`。
   */
  headingLevel?: 2 | 3;
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
