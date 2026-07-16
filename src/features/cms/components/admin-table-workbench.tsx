import { type ReactNode } from "react";
import { Filter, Search, SearchX, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export function AdminTableWorkbench({
  title,
  description,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchMaxLength,
  filterSlot,
  selectionCount,
  actionSlot,
}: {
  title?: string;
  description?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchMaxLength?: number;
  filterSlot?: ReactNode;
  selectionCount?: number;
  actionSlot?: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-3 rounded-md border border-border/70 bg-muted/15 p-3">
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
            <Badge variant="secondary" className="w-fit rounded-sm">
              已选 {selectionCount} 项
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div className="grid min-w-0 gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-center">
        <div className="relative" role="search">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            maxLength={searchMaxLength}
            className="min-h-11 rounded-md border-border/70 bg-background pl-9 pr-12 text-sm shadow-none"
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
          <div className="flex min-w-0 flex-col gap-2 rounded-md border border-border/70 bg-background px-3 py-2 text-sm text-muted-foreground md:flex-row md:flex-wrap md:items-center">
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Filter className="size-4" />
              筛选
            </span>
            {filterSlot}
          </div>
        ) : null}
        {actionSlot ? (
          <div className="flex min-w-0 flex-wrap justify-start gap-2 xl:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            {actionSlot}
          </div>
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
    <div className="rounded-md border border-dashed border-border/70 bg-muted/15 px-4 py-8 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground">
        <SearchX className="size-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-muted-foreground">
        {description}
      </p>
      {actionSlot ? <div className="mt-4">{actionSlot}</div> : null}
    </div>
  );
}
