import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, isWithin24Hours } from "@/lib/utils";
import { type PostWithTags } from "@/types";

function ArticleCard({ post }: { post: PostWithTags }) {
  const isNewPost = isWithin24Hours(post.createdAt);

  return (
    <Card
      key={post.id}
      className="group overflow-hidden rounded-[28px] border border-border/70 bg-background/85 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.38)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/30"
    >
      <div className="grid md:grid-cols-[280px_1fr]">
        <Link
          href={`/fwq/posts/${post.slug}`}
          className="relative min-h-[220px] overflow-hidden md:min-h-full"
        >
          {post.imgUrl ? (
            <Image
              src={`${process.env.NEXT_PUBLIC_URL}${post.imgUrl}`}
              alt={post.title}
              fill
              sizes="(max-width: 768px) 100vw, 280px"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.18),transparent_36%),linear-gradient(135deg,hsl(var(--muted)),hsl(var(--background)))]" />
          )}
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
              <Link href={`/fwq/posts/${post.slug}`}>
                <h3 className="font-editorial line-clamp-2 text-2xl font-semibold leading-tight tracking-[-0.04em] text-foreground transition-colors group-hover:text-accent">
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
                  className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
                >
                  #{tag.tag.name}
                </Link>
              ))}
            </div>

            <Link
              href={`/fwq/posts/${post.slug}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-accent"
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
