import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@fwqgo/core/utils";
import { type PostWithTags } from "@/types";
import { SafePostImage } from "@/features/public/components/safe-post-image";

function ArticleCard({ post }: { post: PostWithTags }) {
  return (
    <Card
      key={post.id}
      className="glass-card hover-lift group overflow-hidden rounded-xl transition-all duration-300"
    >
      <div className="grid md:grid-cols-[240px_1fr] lg:grid-cols-[260px_1fr]">
        <Link
          href={`/fwq/posts/${post.slug}`}
          className="relative aspect-[16/9] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:aspect-auto md:min-h-[210px]"
        >
          <SafePostImage
            src={post.imgUrl}
            alt={post.title}
            sizes="(max-width: 768px) 100vw, 280px"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.14))]" />
        </Link>

        <CardContent className="flex flex-col justify-between p-5 md:p-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
                <CalendarDays className="size-3" />
                {formatDate(post.createdAt)}
              </span>
            </div>

            <div className="space-y-2.5">
              <Link
                href={`/fwq/posts/${post.slug}`}
                className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <h3 className="font-editorial line-clamp-2 text-xl font-semibold leading-snug text-foreground transition-colors group-hover:text-accent md:text-2xl">
                  {post.title}
                </h3>
              </Link>
              <p className="line-clamp-2 text-sm leading-6 text-muted-foreground md:line-clamp-3 md:leading-7">
                {post.description ?? "查看详细测评、优惠信息与适用场景。"}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex min-w-0 flex-wrap gap-2">
              {post.tags.slice(0, 4).map((tag) => (
                <Link
                  key={tag.tag.id}
                  href={`/fwq/tags/${tag.tag.slug}/page/1`}
                  className="inline-flex min-h-8 items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  #{tag.tag.name}
                </Link>
              ))}
            </div>

            <Link
              href={`/fwq/posts/${post.slug}`}
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md text-sm font-medium text-accent underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
