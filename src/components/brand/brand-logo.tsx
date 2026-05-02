import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  withLabel?: boolean;
  compact?: boolean;
};

export function BrandMarkIcon({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={cn("size-10", className)}
    >
      <rect x="4" y="4" width="56" height="56" rx="18" fill="currentColor" />
      <path
        d="M18 18H33V24H24V28H32V34H24V46H18V18Z"
        fill="white"
      />
      <path
        d="M36 19L46 19L34 45H24L36 19Z"
        fill="#EC4899"
      />
      <path
        d="M39.5 33H46V46H40V39H34V33H39.5Z"
        fill="white"
      />
    </svg>
  );
}

export function BrandLogo({
  className,
  markClassName,
  textClassName,
  withLabel = true,
  compact = false,
}: BrandLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[22px] bg-[#18181B] text-[#18181B]",
          compact ? "size-11" : "size-12",
          markClassName,
        )}
      >
        <BrandMarkIcon className={compact ? "size-8" : "size-9"} />
      </div>
      {withLabel ? (
        <div className={cn("min-w-0", textClassName)}>
          <p className="font-editorial text-xl font-semibold tracking-[-0.04em] text-foreground">
            服务器go
          </p>
          <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
            Find Better Hosting Content
          </p>
        </div>
      ) : null}
    </div>
  );
}
