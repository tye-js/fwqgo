import Link from "next/link";
import type { ReactNode } from "react";

export function PublicTaxonomyLink({
  indexable,
  href,
  className,
  children,
}: {
  indexable: boolean;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return indexable ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}
