import Link from "next/link";
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
 * 卡片图片的 `sizes`。
 *
 * 三个值分别对应下面 `grid-cols` 的三套栅格，且 **media query 的断点必须与栅格断点
 * 对齐**——这是这里最容易写错的地方（下面两条都是 2026-09-24 实测才发现并修掉的）。
 *
 * | variant | 栅格 | 图片实际槽位（减掉外壳外边距） |
 * | --- | --- | --- |
 * | feature | 无；`lg` 以上才进两列，占 1.5fr | 390→356 / 900→844 / 1440→696 |
 * | list | `md:224px` / `lg:232px` | 208（768~1023）/ 216（≥1024） |
 * | compact | `sm:112px` | **100**（≥640） |
 *
 * 实测覆盖 390 / 700 / 768 / 900 / 1023 / 1024 / 1440 七个视口。两个已修的坑：
 *
 * 1. **feature 原先的断点是 767，但两列布局要 `lg`（1024）才生效** ——768~1023 之间它
 *    其实是**单列全宽**。声明只给 60vw（768 下 461px），2x 屏据此算出的需求（922px）
 *    远小于实际（1440px），浏览器会选 1080w 去填 720px 的槽位，图片被拉伸 33%
 *    （900 视口下 56%）。断点改为 1023，与 `lg:grid-cols` 对齐。
 * 2. **compact 原先与 list 共用 `232px`**，而它的图片列只有 112px，实际槽位 100px。
 *    声明 232px 会让 2x 屏去选 640w；640~767 视口更糟——那时 media query 命中
 *    `calc(100vw - 2rem)`，会去选 1920w 填 100px 的槽位。断点改为 639，与 `sm:` 对齐。
 *
 * `verify:public-images` 会断言这些值，改栅格列宽时要同步改这里。
 */
function cardImageSizes(variant: "list" | "feature" | "compact") {
  if (variant === "feature") {
    return "(max-width: 1023px) calc(100vw - 2rem), (max-width: 1279px) 56vw, 730px";
  }
  // compact 的图片列是 sm:112px，减掉 m-3（0.75rem）就是 100px。
  if (variant === "compact") {
    return "(max-width: 639px) calc(100vw - 3.5rem), 100px";
  }
  // list 的图片列是 md:224px / lg:232px，减掉 md:m-4（1rem）后是 208 / 216px。
  // 声明 232px 略偏大，但两个断点下都不会跨档位（416 / 432 都落在 640 档），保持简单。
  return "(max-width: 767px) calc(100vw - 2rem), 232px";
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
  /**
   * 预取只留给首屏头条（`feature`）。
   *
   * `<Link>` 默认会在进入视口时预取整页 RSC，而列表页里每张卡片都是一次完整抓取
   * （实测单篇文章预取约 59 KB），首页 9 张卡片加侧栏叠起来比页面本身还重；折线以下
   * 的卡片改成点开再取，`list` 与 `compact` 是列表与侧栏的默认形态，所以默认关掉。
   */
  const shouldPrefetch = variant === "feature";
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
          prefetch={shouldPrefetch}
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
            prefetch={shouldPrefetch}
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
              prefetch={shouldPrefetch}
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
