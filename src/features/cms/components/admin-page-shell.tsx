import { type ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AdminPageShell({
  badge,
  title,
  description,
  actions,
  children,
}: {
  badge?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="flex flex-1 flex-col gap-5 px-4 py-5 md:px-6 lg:px-8"
      aria-label={title}
    >
      <div className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              {title}
            </h1>
            {badge ? (
              <span className="inline-flex items-center rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {badge}
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function AdminSectionCard({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-md border-border/70 bg-card shadow-none">
      {title || description ? (
        <CardHeader className="border-b border-border/60 px-4 py-3 md:px-5">
          <div className="space-y-1">
            {title ? (
              <CardTitle className="text-sm font-semibold tracking-normal">
                {title}
              </CardTitle>
            ) : null}
            {description ? (
              <CardDescription className="text-xs leading-5">
                {description}
              </CardDescription>
            ) : null}
          </div>
        </CardHeader>
      ) : null}
      <CardContent className="px-4 py-4 md:px-5">{children}</CardContent>
    </Card>
  );
}

export function AdminSummaryStrip({
  items,
}: {
  items: Array<{ label: string; value: string; note?: string }>;
}) {
  return (
    <div className="grid overflow-hidden rounded-md border border-border/70 bg-card md:grid-cols-3">
      {items.map((item, index) => (
        <div
          key={item.label}
          className="border-b border-border/60 px-4 py-3 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
        >
          <p className="text-xs font-medium text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
            {item.value}
          </p>
          {item.note ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {item.note}
            </p>
          ) : null}
          {index === items.length - 1 ? null : (
            <span className="sr-only">分隔</span>
          )}
        </div>
      ))}
    </div>
  );
}
