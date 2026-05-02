import { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

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
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <section className="rounded-[28px] border border-border/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.88),rgba(255,255,255,0.96))] px-6 py-6 shadow-sm md:px-8 md:py-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl space-y-3">
            {badge ? (
              <Badge className="bg-primary text-primary-foreground">{badge}</Badge>
            ) : null}
            <h1 className="font-editorial text-4xl font-semibold leading-tight tracking-[-0.05em] text-foreground md:text-5xl">
              {title}
            </h1>
            <p className="text-sm leading-7 text-muted-foreground md:text-base">
              {description}
            </p>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      </section>
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
    <section className="rounded-[26px] border border-border/70 bg-background/92 shadow-sm">
      {title || description ? (
        <div className="border-b border-border/70 px-5 py-4 md:px-6">
          {title ? (
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          ) : null}
          {description ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="px-5 py-5 md:px-6">{children}</div>
    </section>
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
        <div
          key={item.label}
          className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
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
        </div>
      ))}
    </div>
  );
}
