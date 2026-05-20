import { type RecommendedPost } from "@/types/post.types";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { resolveImageUrl } from "@/lib/utils";

export function RecommendedPostCard({ post }: { post: RecommendedPost }) {
  return (
    <Link
      href={`/fwq/posts/${post.slug}`}
      className="group overflow-hidden rounded-[24px] border border-border/70 bg-background/90 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:border-accent/30"
    >
      <div className="relative h-[180px] overflow-hidden">
            {post.imgUrl ? (
              <Image
                src={resolveImageUrl(post.imgUrl) ?? "/img/placeholders/fwq-placeholder.png"}
                alt={post.title}
                fill
                sizes="(max-width: 768px) 100vw, 320px"
                className="object-cover object-center"
              />
            ) : null}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.12))]" />
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-editorial line-clamp-2 text-lg font-semibold leading-7 tracking-[-0.04em] transition-colors group-hover:text-accent">
            {post.title}
          </h3>
          <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </div>
    </Link>
  );
}
