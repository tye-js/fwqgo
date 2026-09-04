import Image from "next/image";
import type { ReactNode } from "react";
import { BookOpenText, ImageIcon } from "lucide-react";

import { TableOfContents } from "@/components/toc/table-of-contents";
import {
  getOptimizedImageSrc,
  isRenderableImageSrc,
} from "@fwqgo/core/image-src";

export const ARTICLE_PROSE_CLASS_NAME =
  "article-prose font-ui prose-headings:font-editorial prose-blockquote:font-ui prose-code:font-ui prose prose-zinc max-w-none prose-p:text-base prose-p:leading-8 prose-p:text-foreground/90 prose-a:text-primary prose-a:underline prose-a:decoration-primary/60 prose-a:underline-offset-4 prose-a:transition-colors hover:prose-a:text-blue-700 hover:prose-a:decoration-blue-700 prose-blockquote:text-base prose-strong:text-foreground prose-code:text-sm prose-li:text-foreground/90";

export function ArticleDetailHeader({
  title,
  description,
  meta,
  actions,
  eyebrow,
}: {
  title: string;
  description: string;
  meta: ReactNode;
  actions: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="border-b border-border/70 pb-5 md:pb-6">
      {eyebrow ? <div className="mb-3">{eyebrow}</div> : null}
      <h1 className="font-editorial max-w-4xl break-words text-2xl font-semibold leading-tight text-foreground sm:text-3xl md:text-4xl">
        {title}
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground md:line-clamp-2 md:text-base md:leading-7">
        {description}
      </p>
      <div className="mt-4 flex min-w-0 flex-col gap-2 border-t border-border/60 pt-2 text-sm text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 [&>*]:min-h-11">
          {meta}
        </div>
        <div className="w-full justify-self-end sm:w-auto">{actions}</div>
      </div>
    </header>
  );
}

export function ArticleCover({
  src,
  alt,
}: {
  src: string | null | undefined;
  alt: string;
}) {
  return (
    <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-lg border border-border/70 bg-muted/30 md:max-w-[640px]">
      {isRenderableImageSrc(src) ? (
        <Image
          src={src.startsWith("/uploads/") ? src : getOptimizedImageSrc(src)}
          alt={alt}
          width={1440}
          height={810}
          sizes="(max-width: 767px) calc(100vw - 2rem), (max-width: 1279px) 820px, 760px"
          className="h-full w-full object-contain"
          quality={75}
          priority
          fetchPriority="high"
          loading="eager"
          unoptimized={src.startsWith("/uploads/")}
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-muted/40 text-muted-foreground">
          <ImageIcon className="size-8" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

export function ArticleTocSidebar({
  content,
  label,
}: {
  content: string;
  label: string;
}) {
  return (
    <aside className="sticky top-20 hidden max-h-[calc(100dvh-96px)] self-start 2xl:block">
      <div className="border-l border-border/80 pl-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BookOpenText className="size-4 text-primary" aria-hidden="true" />
          {label}
        </div>
        <div className="mt-3">
          <TableOfContents content={content} label={label} />
        </div>
      </div>
    </aside>
  );
}

export function ArticlePageSkeleton() {
  return (
    <div className="px-4 pb-10 pt-2 sm:px-6 md:pt-4" aria-hidden="true">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,800px)_280px] 2xl:grid-cols-[180px_minmax(0,760px)_260px] 2xl:gap-5">
        <div className="hidden space-y-3 pt-2 2xl:block">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-8 w-full animate-pulse rounded bg-muted/70" />
          <div className="h-8 w-11/12 animate-pulse rounded bg-muted/70" />
          <div className="h-8 w-10/12 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="min-w-0 space-y-6">
          <div className="space-y-4 border-b border-border/70 pb-6">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-10 w-11/12 animate-pulse rounded bg-muted/80 md:h-12" />
            <div className="h-5 w-full animate-pulse rounded bg-muted/60" />
            <div className="h-5 w-4/5 animate-pulse rounded bg-muted/60" />
            <div className="h-6 w-64 animate-pulse rounded bg-muted/50" />
          </div>
          <div className="aspect-video w-full animate-pulse rounded-lg bg-muted/60 md:max-w-[640px]" />
          <div className="space-y-4">
            <div className="h-5 w-full animate-pulse rounded bg-muted/60" />
            <div className="h-5 w-11/12 animate-pulse rounded bg-muted/60" />
            <div className="h-5 w-10/12 animate-pulse rounded bg-muted/60" />
            <div className="h-32 w-full animate-pulse rounded bg-muted/40" />
          </div>
        </div>
        <div className="hidden space-y-3 border-l border-border/70 pl-4 xl:block">
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="h-14 w-full animate-pulse rounded bg-muted/60" />
          <div className="h-14 w-full animate-pulse rounded bg-muted/60" />
          <div className="h-14 w-full animate-pulse rounded bg-muted/60" />
        </div>
      </div>
    </div>
  );
}
