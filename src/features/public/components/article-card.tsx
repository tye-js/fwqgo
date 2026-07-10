import Link from "next/link";
import { ArrowUpRight, CalendarDays, Tags } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@fwqgo/core/utils";
import { type PostWithTags } from "@/types";
import { SafePostImage } from "@/features/public/components/safe-post-image";

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
    readMore: language === "en" ? "Read more" : "阅读全文",
  };

  return (
    <Card
      key={post.id}
      role="article"
      aria-labelledby={titleId}
      className="group relative overflow-hidden rounded-lg border-border/70 bg-background shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-primary/0 transition-colors duration-200 group-hover:bg-primary/70" />
      <div className="grid gap-0 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]">
        <Link
          href={href}
          prefetch
          aria-label={copy.imageLabel}
          className="relative m-3 mb-0 aspect-[16/9] overflow-hidden rounded-md border border-border/60 bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:mb-3 md:mr-0"
        >
          <SafePostImage
            src={post.imgUrl}
            alt={post.title}
            sizes="(max-width: 768px) calc(100vw - 2rem), 240px"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.12))]" />
        </Link>

        <CardContent className="flex min-w-0 flex-col justify-between p-4 pt-3 md:p-4 lg:p-5">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {primaryTag ? (
                <Link
                  href={`${tagPrefix}/${encodeURIComponent(primaryTag.slug)}/page/1`}
                  prefetch
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-primary/15 bg-primary/5 px-2.5 font-medium text-primary transition-colors hover:border-primary/30 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Tags className="size-3" />
                  {primaryTag.name}
                </Link>
              ) : null}
              <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5">
                <CalendarDays className="size-3" />
                {formatDate(post.createdAt, locale)}
              </span>
            </div>

            <div className="min-w-0 space-y-2">
              <Link
                href={href}
                prefetch
                className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <h3
                  id={titleId}
                  className="font-editorial line-clamp-2 text-base font-semibold leading-6 text-foreground underline-offset-4 transition-colors group-hover:text-primary group-hover:underline md:text-lg md:leading-7"
                >
                  {post.title}
                </h3>
              </Link>
              <p className="line-clamp-2 text-sm leading-6 text-muted-foreground md:line-clamp-2">
                {post.description ?? copy.fallbackDescription}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {secondaryTags.map((tag) => (
                <Link
                  key={tag.tag.id}
                  href={`${tagPrefix}/${encodeURIComponent(tag.tag.slug)}/page/1`}
                  prefetch
                  className="inline-flex min-h-9 items-center rounded-md border border-border/70 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  #{tag.tag.name}
                </Link>
              ))}
            </div>

            <Link
              href={href}
              prefetch
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border/70 px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/35 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-w-24"
            >
              {copy.readMore}
              <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

export default ArticleCard;
