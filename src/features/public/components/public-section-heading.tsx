import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function PublicSectionHeading({
  title,
  description,
  href,
  linkLabel,
  eyebrow,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  eyebrow?: string;
}) {
  return (
    <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="public-kicker mb-2">{eyebrow}</p> : null}
        <h2 className="public-section-title">{title}</h2>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {href && linkLabel ? (
        <Link
          href={href}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          {linkLabel}
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
