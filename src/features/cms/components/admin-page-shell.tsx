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
  showHeading = true,
  children,
}: {
  badge?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  showHeading?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col gap-3 px-3 py-3 md:gap-4 md:px-5 md:py-4"
      aria-label={title}
    >
      {showHeading || actions ? (
        <div
          className={`flex flex-col gap-2 border-b border-border/70 pb-3 md:flex-row md:items-start ${showHeading ? "md:justify-between" : "md:justify-end"}`}
        >
          {showHeading ? (
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
                  {title}
                </h1>
                {badge ? (
                  <span className="inline-flex h-6 items-center rounded-sm border border-border bg-muted/50 px-2 text-xs font-medium text-muted-foreground">
                    {badge}
                  </span>
                ) : null}
              </div>
              {description ? (
                <p className="max-w-4xl text-xs leading-5 text-muted-foreground md:text-sm">
                  {description}
                </p>
              ) : null}
            </div>
          ) : null}
          {actions ? (
            <div className="flex w-full shrink-0 flex-wrap items-center gap-2 md:w-auto md:justify-end [&>*]:w-full sm:[&>*]:w-auto [&_a]:min-h-11 [&_button]:min-h-11">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
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
    <Card className="min-w-0 rounded-md border-border/70 bg-card shadow-none">
      {title || description ? (
        <CardHeader className="border-b border-border/60 px-3 py-2.5 md:px-4">
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
      <CardContent className="min-w-0 px-3 py-3 md:px-4">
        {children}
      </CardContent>
    </Card>
  );
}

export function AdminSummaryStrip({
  items,
}: {
  items: Array<{ label: string; value: string; note?: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border/70 bg-border/70 lg:[grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`min-w-0 bg-card px-3 py-2.5 ${
            items.length % 2 === 1 && index === items.length - 1
              ? "col-span-2 lg:col-span-1"
              : ""
          }`}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
            {item.value}
          </p>
          {item.note ? (
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
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
