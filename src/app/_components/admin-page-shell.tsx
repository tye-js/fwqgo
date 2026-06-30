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
      className="flex flex-1 flex-col gap-5 px-4 py-4 md:px-6"
      aria-label={title}
    >
      <h1 className="sr-only">{title}</h1>
      {description ? <p className="sr-only">{description}</p> : null}
      {actions || badge ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {badge ? (
            <span className="inline-flex items-center rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {badge}
            </span>
          ) : (
            <span />
          )}
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
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
    <Card className="rounded-lg border-border/70 shadow-sm">
      {title || description ? (
        <CardHeader className="border-b border-border/70 px-5 py-4 md:px-6">
          {title ? (
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
          ) : null}
          {description ? (
            <CardDescription className="text-sm leading-6">
              {description}
            </CardDescription>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent className="px-5 py-5 md:px-6">{children}</CardContent>
    </Card>
  );
}

export function AdminSummaryStrip({
  items,
}: {
  items: Array<{ label: string; value: string; note?: string }>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label} className="rounded-lg border-border/70 shadow-sm">
          <CardContent className="px-4 py-4">
            <p className="text-xs font-medium text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {item.value}
            </p>
            {item.note ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {item.note}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
