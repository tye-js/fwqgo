import { type ReactNode } from "react";
import { Filter, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export function AdminTableWorkbench({
  title,
  description,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filterSlot,
  selectionCount,
  actionSlot,
}: {
  title?: string;
  description?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filterSlot?: ReactNode;
  selectionCount?: number;
  actionSlot?: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border/70 bg-muted/15 p-3">
      {title || description || (selectionCount && selectionCount > 0) ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {title || description ? (
            <div className="space-y-1">
              {title ? (
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              ) : null}
              {description ? (
                <p className="line-clamp-1 text-xs leading-5 text-muted-foreground">
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

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 rounded-md border-border/70 bg-background pl-9 text-sm shadow-none"
          />
        </div>
        {filterSlot ? (
          <div className="flex min-w-0 flex-col gap-2 rounded-md border border-border/70 bg-background px-3 py-2 text-sm text-muted-foreground md:flex-row md:items-center">
            <Filter className="size-4" />
            {filterSlot}
          </div>
        ) : null}
        {actionSlot ? (
          <div className="flex min-w-0 justify-start xl:justify-end">
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
    <div className="rounded-md border border-dashed border-border/70 bg-muted/15 px-4 py-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-muted-foreground">
        {description}
      </p>
      {actionSlot ? <div className="mt-4">{actionSlot}</div> : null}
    </div>
  );
}
