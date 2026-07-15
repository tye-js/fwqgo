import Link from "next/link";
import { ArrowUpRight, CalendarDays, Newspaper } from "lucide-react";

import { SafePostImage } from "@/features/public/components/safe-post-image";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@fwqgo/core/utils";

type LatestPostItem = {
  id: number;
  title: string;
  slug: string;
  imgUrl: string | null;
  createdAt: Date;
};

export function LatestPostsSidebar({
  posts,
  language = "zh",
}: {
  posts: LatestPostItem[];
  language?: "zh" | "en";
}) {
  if (posts.length === 0) return null;
  const postPrefix = language === "en" ? "/en/fwq/posts" : "/fwq/posts";
  const locale = language === "en" ? "en-US" : "zh-CN";

  const featuredPost = posts[0];
  if (!featuredPost) return null;
  const compactPosts = posts.slice(1);

  return (
    <Card className="overflow-hidden rounded-lg border-border/70 bg-background shadow-sm">
      <CardContent className="p-0">
        <div className="border-b border-border/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Newspaper className="size-4 text-accent" />
              {language === "en" ? "Latest articles" : "最新文章"}
            </div>
            <Link
              href={
                language === "en" ? "/en/fwq/vps/page/1" : "/fwq/vps/page/1"
              }
              prefetch
              className="inline-flex min-h-9 items-center rounded-md text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {language === "en" ? "View more" : "查看更多"}
            </Link>
          </div>
        </div>

        <Link
          href={`${postPrefix}/${encodeURIComponent(featuredPost.slug)}`}
          prefetch
          className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="relative aspect-[16/9] overflow-hidden bg-muted">
            <SafePostImage
              src={featuredPost.imgUrl}
              alt={featuredPost.title}
              sizes="320px"
            />
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/45 to-transparent" />
            <span className="absolute left-4 top-4 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm">
              {language === "en" ? "New" : "最新"}
            </span>
          </div>
          <div className="space-y-2 border-b border-border/70 p-5">
            <h3 className="line-clamp-2 text-base font-semibold leading-6 text-foreground underline-offset-4 transition-colors group-hover:text-accent group-hover:underline">
              {featuredPost.title}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" />
              {formatDate(featuredPost.createdAt, locale)}
            </div>
          </div>
        </Link>

        <div className="divide-y divide-border/60">
          {compactPosts.map((post, index) => (
            <Link
              key={post.id}
              href={`${postPrefix}/${encodeURIComponent(post.slug)}`}
              prefetch
              className="group grid min-h-16 grid-cols-[28px_1fr_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground transition-colors group-hover:bg-accent/10 group-hover:text-accent">
                {index + 2}
              </span>
              <span className="min-w-0">
                <span className="line-clamp-2 text-sm font-medium leading-5 text-foreground underline-offset-4 transition-colors group-hover:text-accent group-hover:underline">
                  {post.title}
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3" />
                  {formatDate(post.createdAt, locale)}
                </span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
