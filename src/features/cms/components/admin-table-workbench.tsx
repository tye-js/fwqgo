import { type CompositionEventHandler, type ReactNode } from "react";
import { ChevronDown, Filter, Search, SearchX, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export function AdminTableWorkbench({
  title,
  description,
  searchValue,
  onSearchChange,
  onSearchCompositionStart,
  onSearchCompositionEnd,
  searchPlaceholder,
  searchMaxLength,
  filterSlot,
  selectionCount,
  actionSlot,
  actionDisclosureId,
}: {
  title?: string;
  description?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchCompositionStart?: CompositionEventHandler<HTMLInputElement>;
  onSearchCompositionEnd?: CompositionEventHandler<HTMLInputElement>;
  searchPlaceholder: string;
  searchMaxLength?: number;
  filterSlot?: ReactNode;
  selectionCount?: number;
  actionSlot?: ReactNode;
  actionDisclosureId?: string;
}) {
  return (
    <div className="cms-workbench min-w-0 space-y-4 p-4 md:p-5">
      {title || description || (selectionCount && selectionCount > 0) ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {title || description ? (
            <div className="space-y-1">
              {title ? (
                <h3 className="text-sm font-semibold text-foreground">
                  {title}
                </h3>
              ) : null}
              {description ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          ) : null}
          {selectionCount && selectionCount > 0 ? (
            <Badge
              variant="secondary"
              className="w-fit rounded-full bg-primary/10 px-3 py-1 text-primary"
            >
              已选 {selectionCount} 项
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div
        className={`grid min-w-0 gap-3 xl:items-center ${
          actionSlot
            ? "xl:grid-cols-[minmax(20rem,1fr)_auto]"
            : filterSlot
              ? "xl:grid-cols-[minmax(20rem,1fr)_minmax(18rem,auto)]"
              : ""
        }`}
      >
        <div className="relative" role="search">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            onCompositionStart={onSearchCompositionStart}
            onCompositionEnd={onSearchCompositionEnd}
            placeholder={searchPlaceholder}
            maxLength={searchMaxLength}
            className="min-h-11 rounded-lg border-input bg-background/50 pl-10 pr-12 text-sm shadow-none"
            aria-label={searchPlaceholder}
          />
          {searchValue ? (
            <button
              type="button"
              className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onSearchChange("")}
              aria-label="清空搜索"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        {filterSlot ? (
          <div
            className={`flex min-w-0 flex-col gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground md:flex-row md:flex-wrap md:items-center ${
              actionSlot
                ? // 有批量操作时，筛选单独占第二行；按内容收缩，避免撑成一条大半是空白的横带。
                  "xl:col-start-1 xl:row-start-2 xl:w-fit xl:max-w-full xl:justify-self-start"
                : ""
            }`}
          >
            <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
              <Filter className="size-4" />
              筛选
            </span>
            {filterSlot}
          </div>
        ) : null}
        {actionSlot ? (
          <details
            id={actionDisclosureId}
            open={selectionCount && selectionCount > 0 ? true : undefined}
            className="group min-w-0 scroll-mt-20 xl:contents"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-md border border-border/70 bg-background px-3 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring xl:hidden [&::-webkit-details-marker]:hidden">
              批量与更多操作
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 flex min-w-0 flex-wrap justify-start gap-2 group-open:flex xl:col-start-2 xl:row-start-1 xl:mt-0 xl:flex xl:justify-end [&>*]:w-full sm:[&>*]:w-auto">
              {actionSlot}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export function AdminTableEmpty({
  title,
  description,
  actionSlot,
}: {
  title: string;
  description: string;
  actionSlot?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-5 py-12 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/5 text-primary">
        <SearchX className="size-5" />
      </div>
      <p className="mt-4 text-base font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {actionSlot ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2 [&_a]:min-h-11 [&_button]:min-h-11">
          {actionSlot}
        </div>
      ) : null}
    </div>
  );
}
