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
    <div className="space-y-4 rounded-lg border border-border/70 bg-muted/20 p-5">
      {title || description || (selectionCount && selectionCount > 0) ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          {title || description ? (
            <div className="space-y-1">
              {title ? (
                <h3 className="text-lg font-semibold text-foreground">{title}</h3>
              ) : null}
              {description ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          ) : null}
          {selectionCount && selectionCount > 0 ? (
            <Badge className="w-fit bg-primary text-primary-foreground">
              已选 {selectionCount} 项
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-11 rounded-full border-border/70 bg-background pl-11"
          />
        </div>
        {filterSlot ? (
          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background px-4 py-2.5 text-sm text-muted-foreground">
            <Filter className="size-4" />
            {filterSlot}
          </div>
        ) : null}
        {actionSlot ? <div className="flex justify-start lg:justify-end">{actionSlot}</div> : null}
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
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center">
      <p className="text-base font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {actionSlot ? <div className="mt-5">{actionSlot}</div> : null}
    </div>
  );
}
