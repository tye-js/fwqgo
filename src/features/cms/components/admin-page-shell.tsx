import { type ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
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
      className="cms-page flex min-w-0 flex-1 flex-col gap-5 px-4 py-5 md:gap-6 md:px-6 md:py-6 xl:px-8"
      aria-label={title}
    >
      {!showHeading ? <h1 className="sr-only">{title}</h1> : null}
      {showHeading || actions ? (
        <div
          className={`cms-page-header flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start ${showHeading ? "xl:justify-between" : "xl:justify-end"}`}
        >
          {showHeading ? (
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-col items-start gap-2">
                {badge ? (
                  <span className="cms-kicker max-w-full break-words">
                    {badge}
                  </span>
                ) : null}
                <h1 className="cms-page-title min-w-0 break-words text-2xl font-semibold text-foreground md:text-[1.7rem]">
                  {title}
                </h1>
              </div>
              {description ? (
                <p className="max-w-4xl break-words text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          ) : null}
          {actions ? (
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 xl:w-auto xl:max-w-[60%] xl:justify-end [&>*]:w-full sm:[&>*]:w-auto [&_a]:min-h-11 [&_button]:min-h-11">
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
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="cms-panel min-w-0">
      {title || description ? (
        <CardHeader className="cms-section-header border-b border-border/70 px-4 py-4 md:px-5">
          <div className="space-y-1">
            {title ? (
              <h2 className="text-base font-semibold tracking-tight">
                {title}
              </h2>
            ) : null}
            {description ? (
              <CardDescription className="break-words text-sm leading-6">
                {description}
              </CardDescription>
            ) : null}
          </div>
        </CardHeader>
      ) : null}
      <CardContent className="min-w-0 p-4 md:p-5">{children}</CardContent>
    </Card>
  );
}

export function AdminSummaryStrip({
  items,
}: {
  items: Array<{ label: string; value: string; note?: string }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:[grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`cms-metric-card min-w-0 px-4 py-4 ${
            items.length % 2 === 1 && index === items.length - 1
              ? "sm:col-span-2 lg:col-span-1"
              : ""
          }`}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-2 break-words text-2xl font-semibold tabular-nums tracking-tight text-foreground">
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
