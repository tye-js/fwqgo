import Link from "next/link";
import { ArrowUpRight, Files } from "lucide-react";

export default function PageCard({
  kind = "专题",
  name,
  description,
  totalCount,
  pageNo,
  language = "zh",
  variant = "card",
}: {
  kind?: string;
  name: string;
  description: string;
  totalCount?: number;
  pageNo?: number;
  language?: "zh" | "en";
  variant?: "card" | "compact";
}) {
  const english = language === "en";
  const prefix = english ? "/en" : "";
  return (
    <header
      className={`public-page-intro ${variant === "compact" ? "mb-6" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="public-kicker">{kind}</p>
        {pageNo ? (
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            {english ? `Page ${pageNo}` : `第 ${pageNo} 页`}
          </span>
        ) : null}
      </div>
      <h1 className="mt-4 max-w-4xl">{name}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
        {description}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border/75 pt-3">
        {typeof totalCount === "number" ? (
          <span className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
            <Files className="size-4 text-primary" aria-hidden="true" />
            <strong className="public-stat text-lg font-semibold text-foreground">
              {totalCount.toLocaleString(english ? "en-US" : "zh-CN")}
            </strong>
            {english ? "published articles" : "篇已发布文章"}
          </span>
        ) : null}
        <nav
          aria-label={english ? "Explore related sections" : "继续探索"}
          className="flex flex-wrap gap-x-4 gap-y-1"
        >
          <Link
            href={`${prefix}/knowledge`}
            className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary"
          >
            {english ? "Knowledge base" : "知识库"}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
          <Link
            href="/servers"
            className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary"
          >
            {english ? "Compare servers" : "服务器比价"}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
