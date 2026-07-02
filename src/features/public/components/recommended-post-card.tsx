import { type RecommendedPost } from "@/types/post.types";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SafePostImage } from "@/features/public/components/safe-post-image";

export function RecommendedPostCard({ post }: { post: RecommendedPost }) {
  return (
    <Link
      href={`/fwq/posts/${post.slug}`}
      prefetch
      className="group overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm transition-colors duration-200 hover:border-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        <SafePostImage
          src={post.imgUrl}
          alt={post.title}
          sizes="(max-width: 768px) 100vw, 320px"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.12))]" />
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-editorial line-clamp-2 text-base font-semibold leading-6 underline-offset-4 transition-colors group-hover:text-accent group-hover:underline md:text-lg md:leading-7">
            {post.title}
          </h3>
          <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </div>
    </Link>
  );
}
