import Image from "next/image";
import type { ReactNode } from "react";
import { BookOpenText, ChevronDown, ImageIcon } from "lucide-react";

import { TableOfContents } from "@/components/toc/table-of-contents";
import { STICKY_RAIL_XL } from "@/features/public/lib/sticky-rail";
import type { TocItem } from "@fwqgo/core/toc";
import {
  hasRenderableCover,
  isDefaultArticleCover,
} from "@fwqgo/core/article-cover";
import { ServerCoverArt } from "./server-cover-art";
import { getOptimizedImageSrc } from "@fwqgo/core/image-src";

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
  const imageSrc = hasRenderableCover(src) ? getOptimizedImageSrc(src) : null;

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
 * 详情页侧栏容器（`xl` 起出现在**正文左侧**）。
 *
 * 位置：栅格是 `xl:grid-cols-[288px_minmax(0,820px)]`，侧栏是第一列，所以目录在左。
 * **正文列宽不变（仍是 820px）**——这正是「目录不要占文本内容宽度」的要求。
 * 做成「目录 + 正文 + 最新文章」三栏放不下：版心内容区在 ≥1280px 只有 1184px，
 * 而 288 + 32 + 820 + 32 + 288 = 1460px，即使把目录压到 200px 也仍需 1372px。
 *
 * 宽度固定，`sticky` 跟随滚动。它存在的意义是把 1280–1535px 这一段主流桌面宽度里
 * 原本空着的侧边利用起来——之前只有 `2xl` 才有一列，于是 1280/1440 下正文两侧各空一大块。
 *
 * 高度必须夹在视口内（长目录 + 最新文章列表会到 1300px+），这个不变式现在
 * 收敛在 `@/features/public/lib/sticky-rail`：前台 7 处侧栏里只有这里最初记住了
 * 高度上限，另外 6 处漏掉后底部内容永久不可达。所以这里改成引用同一个常量，
 * 不再自己写一遍类名。目录和列表也就此不再各自开滚动条。
 */
export function ArticleRail({ children }: { children: ReactNode }) {
  return (
    <aside
      className={`hidden min-w-0 space-y-5 self-start xl:block xl:pr-1 ${STICKY_RAIL_XL}`}
    >
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
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[288px_minmax(0,820px)] xl:justify-center xl:gap-8">
      {/* 占位侧栏必须排在正文之前，与真实布局的「目录在左」一致。 */}
      <div className="hidden space-y-5 xl:block">
        <div className="h-56 w-full animate-pulse rounded-xl bg-muted/50" />
        <div className="h-40 w-full animate-pulse rounded-xl bg-muted/40" />
      </div>
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
