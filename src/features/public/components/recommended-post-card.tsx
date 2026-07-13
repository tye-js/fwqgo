import { type RecommendedPost } from "@/types/post.types";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SafePostImage } from "@/features/public/components/safe-post-image";

export function RecommendedPostCard({ post }: { post: RecommendedPost }) {
  return (
    <Link
      href={`/fwq/posts/${encodeURIComponent(post.slug)}`}
      prefetch
      className="group grid min-h-24 grid-cols-[104px_minmax(0,1fr)] overflow-hidden rounded-md border border-border/70 bg-background transition-colors duration-200 hover:border-primary/35 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="relative min-h-24 overflow-hidden border-r border-border/60 bg-muted">
        <SafePostImage src={post.imgUrl} alt={post.title} sizes="104px" />
      </div>
      <div className="flex min-w-0 items-start gap-2 p-3">
        <h3 className="font-editorial line-clamp-3 text-sm font-semibold leading-6 text-foreground underline-offset-4 transition-colors group-hover:text-primary group-hover:underline">
          {post.title}
        </h3>
        <ArrowUpRight
          className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}
