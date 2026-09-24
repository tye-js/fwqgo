import Image from "next/image";
import type { ReactNode } from "react";
import { BookOpenText, ChevronDown, ImageIcon } from "lucide-react";

import { TableOfContents } from "@/components/toc/table-of-contents";
import type { TocItem } from "@fwqgo/core/toc";
import { isDefaultArticleCover } from "@fwqgo/core/article-cover";
import { ServerCoverArt } from "./server-cover-art";
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
    <header className="border-b border-border/70 pb-5 md:pb-7">
      {eyebrow ? <div className="mb-3">{eyebrow}</div> : null}
      <h1 className="font-editorial max-w-4xl break-words text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl md:text-4xl">
        {title}
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
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
  width = 1280,
  height = 720,
}: {
  src: string | null | undefined;
  alt: string;
  width?: number;
  height?: number;
}) {
  const imageSrc = isRenderableImageSrc(src) ? getOptimizedImageSrc(src) : null;

  return (
    <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-xl border border-border/70 bg-muted/30">
      {isDefaultArticleCover(src) ? (
        <ServerCoverArt />
      ) : imageSrc ? (
        <Image
          src={imageSrc}
          alt={alt}
          width={width}
          height={height}
          sizes="(max-width: 767px) calc(100vw - 4rem), (max-width: 1279px) min(748px, calc(100vw - 6rem)), 700px"
          className="h-full w-full object-contain"
          quality={75}
          preload
          fetchPriority="high"
          loading="eager"
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-muted/40 text-muted-foreground">
          <ImageIcon className="size-8" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

/**
 * 详情页右栏容器。
 *
 * `xl` 起才出现，宽度固定，`sticky` 跟随滚动。它存在的意义是把 1280–1535px
 * 这一段主流桌面宽度里原本空着的右侧利用起来——之前只有 `2xl` 才有一列，
 * 于是 1280/1440 下正文两侧各空一大块。
 *
 * 高度必须夹在视口内：`sticky` 元素一旦比视口高，被钉住后**底部永远滚不出来**
 * （长目录 + 最新文章列表会到 1300px+）。所以这里自己做滚动容器，
 * 目录和列表就不再各自开滚动条。
 */
export function ArticleRail({ children }: { children: ReactNode }) {
  return (
    <aside className="hidden min-w-0 space-y-5 self-start xl:sticky xl:top-24 xl:block xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto xl:overscroll-contain xl:pr-1">
      {children}
    </aside>
  );
}

/** 右栏/窄屏共用的目录卡片。目录为空（正文没有二至六级标题）时不渲染。 */
export function ArticleTocSidebar({
  items,
  label,
}: {
  items: TocItem[];
  label: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-border/80 bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <BookOpenText className="size-4 text-primary" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-3">
        <TableOfContents items={items} label={label} navClassName="toc" />
      </div>
    </section>
  );
}

/**
 * `xl` 以下的目录入口。
 *
 * 用原生 `<details>` 而不是折叠面板组件：服务端渲染、零客户端 JS，
 * 与桌面导航同一套取舍。
 */
export function ArticleMobileToc({
  items,
  label,
}: {
  items: TocItem[];
  label: string;
}) {
  if (items.length === 0) return null;

  return (
    <details className="group rounded-xl border border-border/80 bg-muted/20 xl:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <BookOpenText className="size-4 text-primary" aria-hidden="true" />
          {label}
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {items.length}
          <ChevronDown
            className="size-4 shrink-0 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </span>
      </summary>
      <div className="border-t border-border/70 px-4 py-3">
        <TableOfContents items={items} label={label} navClassName="toc" />
      </div>
    </details>
  );
}

export function ArticlePageSkeleton({
  variant = "nested",
}: {
  variant?: "nested" | "full";
}) {
  const grid = (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,820px)_288px] xl:justify-center xl:gap-8">
      <div className="mx-auto w-full min-w-0 max-w-[820px] space-y-6 xl:mx-0 xl:max-w-none">
        <div className="space-y-4 border-b border-border/70 pb-6">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-10 w-11/12 animate-pulse rounded bg-muted/80 md:h-12" />
          <div className="h-5 w-full animate-pulse rounded bg-muted/60" />
          <div className="h-5 w-4/5 animate-pulse rounded bg-muted/60" />
          <div className="h-6 w-64 animate-pulse rounded bg-muted/50" />
        </div>
        <div className="aspect-video w-full animate-pulse rounded-lg bg-muted/60" />
        <div className="space-y-4">
          <div className="h-5 w-full animate-pulse rounded bg-muted/60" />
          <div className="h-5 w-11/12 animate-pulse rounded bg-muted/60" />
          <div className="h-5 w-10/12 animate-pulse rounded bg-muted/60" />
          <div className="h-32 w-full animate-pulse rounded bg-muted/40" />
        </div>
      </div>
      <div className="hidden space-y-5 xl:block">
        <div className="h-56 w-full animate-pulse rounded-xl bg-muted/50" />
        <div className="h-40 w-full animate-pulse rounded-xl bg-muted/40" />
      </div>
    </div>
  );

  return variant === "full" ? (
    <div
      className="container mx-auto px-4 py-4 sm:px-6 md:py-6"
      aria-hidden="true"
    >
      {grid}
    </div>
  ) : (
    <div className="px-4 pb-10 pt-2 sm:px-6 md:pt-4" aria-hidden="true">
      {grid}
    </div>
  );
}
