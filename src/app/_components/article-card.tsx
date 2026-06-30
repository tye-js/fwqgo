import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, isWithin24Hours } from "@/lib/utils";
import { type PostWithTags } from "@/types";
import { SafePostImage } from "@/app/_components/safe-post-image";

function ArticleCard({ post }: { post: PostWithTags }) {
  const isNewPost = isWithin24Hours(post.createdAt);

  return (
    <Card
      key={post.id}
      className="glass-card hover-lift group overflow-hidden rounded-2xl transition-all duration-300"
    >
      <div className="grid md:grid-cols-[280px_1fr]">
        <Link
          href={`/fwq/posts/${post.slug}`}
          className="relative aspect-[16/10] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:aspect-auto md:min-h-full"
        >
          <SafePostImage
            src={post.imgUrl}
            alt={post.title}
            sizes="(max-width: 768px) 100vw, 280px"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.14))]" />
        </Link>

        <CardContent className="flex flex-col justify-between p-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {isNewPost ? (
                <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">
                  NEW
                </Badge>
              ) : null}
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
                <CalendarDays className="size-3" />
                {formatDate(post.createdAt)}
              </span>
            </div>

            <div className="space-y-3">
              <Link
                href={`/fwq/posts/${post.slug}`}
                className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <h3 className="font-editorial line-clamp-2 text-2xl font-semibold leading-tight text-foreground transition-colors group-hover:text-accent">
                  {post.title}
                </h3>
              </Link>
              <p className="line-clamp-3 text-sm leading-7 text-muted-foreground">
                {post.description ?? "查看详细测评、优惠信息与适用场景。"}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap gap-2">
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
              className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
