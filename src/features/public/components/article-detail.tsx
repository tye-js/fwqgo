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
      <h1 className="font-editorial max-w-4xl text-3xl font-semibold leading-tight text-foreground md:text-4xl">
        {title}
      </h1>
      <p className="mt-3 line-clamp-2 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
        {description}
      </p>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-border/60 pt-2 text-sm text-muted-foreground">
        <div className="flex min-w-0 flex-nowrap items-center gap-x-3 overflow-hidden">
          {meta}
        </div>
        <div className="shrink-0 justify-self-end">{actions}</div>
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
          src={getOptimizedImageSrc(src)}
          alt={alt}
          width={1440}
          height={810}
          sizes="(max-width: 767px) calc(100vw - 2rem), (max-width: 1279px) 820px, 760px"
          className="h-full w-full object-contain"
          quality={75}
          priority
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
