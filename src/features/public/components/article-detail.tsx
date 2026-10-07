import type { ReactNode } from "react";
import { cn, formatDate } from "@fwqgo/core/utils";
import { BookOpenText, CalendarDays, ChevronDown } from "lucide-react";

import { TableOfContents } from "@/components/toc/table-of-contents";
import { STICKY_RAIL_XL } from "@/features/public/lib/sticky-rail";
import type { TocItem } from "@fwqgo/core/toc";

export const ARTICLE_PROSE_CLASS_NAME =
  "article-prose font-ui prose-headings:font-editorial prose-blockquote:font-ui prose-code:font-ui prose prose-zinc max-w-none prose-p:text-base prose-p:leading-8 prose-p:text-foreground/90 prose-a:text-primary prose-a:underline prose-a:decoration-primary/60 prose-a:underline-offset-4 prose-a:transition-colors hover:prose-a:text-blue-700 hover:prose-a:decoration-blue-700 prose-blockquote:text-base prose-strong:text-foreground prose-code:text-sm prose-li:text-foreground/90";

/**
 * 文章页头的日期信息。
 *
 * 只在文章被实质性修改过时显示「更新于」：发布时间按站内约定不向读者展示。
 * `modifiedTime === publishedTime` 表示文章从未被修改（或历史数据里更新时间早于
 * 创建时间），此时不输出任何日期，避免在页头留下一个只剩图标或空白的行。
 *
 * SEO 侧的 `datePublished` / `dateModified` 由 `buildArticleSeo` 独立产出，
 * 不受这里的展示取舍影响。
 */
export function ArticlePublicationMeta({
  publishedTime,
  modifiedTime,
  language = "zh",
}: {
  publishedTime?: string;
  modifiedTime?: string;
  language?: "zh" | "en";
}) {
  if (!publishedTime) return null;
  // 文章未被实质修改时（含历史数据里更新时间早于创建时间的回落）不显示任何日期。
  if (!modifiedTime || modifiedTime <= publishedTime) return null;
  const english = language === "en";
  const locale = english ? "en-US" : "zh-CN";
  return (
    <span className="inline-flex min-h-11 flex-wrap items-center gap-2 tabular-nums">
      <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
      {english ? "Updated" : "更新于"}
      <time dateTime={modifiedTime}>{formatDate(modifiedTime, locale)}</time>
    </span>
  );
}

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

/**
 * 中英文详情共用的阅读布局。
 * 正文始终保留 820px：xl 起最新文章位于右侧；2xl 起向外扩展版心容纳目录，
 * 不从正文分配宽度。窄屏侧栏回到文末，目录由 ArticleMobileToc 提供。
 * 吸顶侧栏各自持有视口高度上限，目录本身不再嵌套滚动。
 */
export function ArticleDetailLayout({
  children,
  toc,
  latest,
}: {
  children: ReactNode;
  toc?: ReactNode;
  latest?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "article-detail-layout",
        toc && "article-detail-layout--with-toc",
        latest && "article-detail-layout--with-latest",
      )}
    >
      {toc ? (
        <aside
          className={`article-detail-toc hidden min-w-0 self-start pr-1 2xl:block ${STICKY_RAIL_XL}`}
        >
          {toc}
        </aside>
      ) : null}
      <div className="article-detail-content min-w-0 space-y-10">
        {children}
      </div>
      {latest ? (
        <aside
          className={`article-detail-latest min-w-0 self-start xl:pr-1 ${STICKY_RAIL_XL}`}
        >
          {latest}
        </aside>
      ) : null}
    </div>
  );
}

/** 宽屏独立目录列。正文没有标题时不渲染。 */
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
 * `2xl` 以下的目录入口：普通桌面也保留正文整列，不再把目录塞进阅读宽度。
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
    <details className="group rounded-xl border border-border/80 bg-muted/20 2xl:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <BookOpenText className="size-4 text-primary" aria-hidden="true" />
          {label}
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {items.length}
          <ChevronDown
            className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
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
    <ArticleDetailLayout
      toc={<div className="h-56 w-full animate-pulse rounded-xl bg-muted/50" />}
      latest={
        <div className="h-96 w-full animate-pulse rounded-xl bg-muted/40" />
      }
    >
      <div className="space-y-6">
        <div className="space-y-4 border-b border-border/70 pb-6">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-10 w-11/12 animate-pulse rounded bg-muted/80 md:h-12" />
          <div className="h-5 w-full animate-pulse rounded bg-muted/60" />
          <div className="h-5 w-4/5 animate-pulse rounded bg-muted/60" />
          <div className="h-6 w-64 animate-pulse rounded bg-muted/50" />
        </div>
        <div className="space-y-4">
          <div className="h-5 w-full animate-pulse rounded bg-muted/60" />
          <div className="h-5 w-11/12 animate-pulse rounded bg-muted/60" />
          <div className="h-5 w-10/12 animate-pulse rounded bg-muted/60" />
          <div className="h-32 w-full animate-pulse rounded bg-muted/40" />
        </div>
      </div>
    </ArticleDetailLayout>
  );

  return variant === "full" ? (
    <div
      className="container mx-auto px-4 py-4 sm:px-6 md:py-6"
      aria-hidden="true"
    >
      {grid}
    </div>
  ) : (
    <div className="pb-10 pt-2 md:pt-4" aria-hidden="true">
      {grid}
    </div>
  );
}
