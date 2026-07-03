import Link from "next/link";
import { ArrowUpRight, CalendarDays, Tags } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@fwqgo/core/utils";
import { type PostWithTags } from "@/types";
import { SafePostImage } from "@/features/public/components/safe-post-image";

function ArticleCard({ post }: { post: PostWithTags }) {
  const href = `/fwq/posts/${post.slug}`;

  return (
    <Card
      key={post.id}
      className="group overflow-hidden rounded-lg border-border/70 bg-background shadow-sm transition-colors duration-200 hover:border-accent/35"
    >
      <div className="grid gap-0 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)]">
        <Link
          href={href}
          prefetch
          aria-label={`阅读文章：${post.title}`}
          className="relative m-3 mb-0 aspect-[16/9] overflow-hidden rounded-md bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:mb-3 md:mr-0"
        >
          <SafePostImage
            src={post.imgUrl}
            alt={post.title}
            sizes="(max-width: 768px) calc(100vw - 2rem), 260px"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.10))]" />
        </Link>

        <CardContent className="flex min-w-0 flex-col justify-between p-4 md:p-5">
          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3" />
                {formatDate(post.createdAt)}
              </span>
              {post.tags[0]?.tag ? (
                <Link
                  href={`/fwq/tags/${post.tags[0].tag.slug}/page/1`}
                  prefetch
                  className="inline-flex min-h-6 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Tags className="size-3" />
                  {post.tags[0].tag.name}
                </Link>
              ) : null}
            </div>

            <div className="min-w-0 space-y-2">
              <Link
                href={href}
                prefetch
                className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <h3 className="font-editorial line-clamp-2 text-lg font-semibold leading-snug text-foreground underline-offset-4 transition-colors group-hover:text-accent group-hover:underline md:text-xl">
                  {post.title}
                </h3>
              </Link>
              <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                {post.description ?? "查看详细测评、优惠信息与适用场景。"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {post.tags.slice(1, 4).map((tag) => (
                <Link
                  key={tag.tag.id}
                  href={`/fwq/tags/${tag.tag.slug}/page/1`}
                  prefetch
                  className="inline-flex min-h-7 items-center rounded-full border border-border/70 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/30 hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  #{tag.tag.name}
                </Link>
              ))}
            </div>

            <Link
              href={href}
              prefetch
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md text-sm font-medium text-accent underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              阅读全文
              <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

export default ArticleCard;
