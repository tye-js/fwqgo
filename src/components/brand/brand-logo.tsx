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
      <rect x="4" y="4" width="56" height="56" rx="18" fill="#111827" />
      <path
        d="M17 15H42C45.3137 15 48 17.6863 48 21V23C48 26.3137 45.3137 29 42 29H17C13.6863 29 11 26.3137 11 23V21C11 17.6863 13.6863 15 17 15Z"
        fill="#F8FAFC"
      />
      <path
        d="M17 35H42C45.3137 35 48 37.6863 48 41V43C48 46.3137 45.3137 49 42 49H17C13.6863 49 11 46.3137 11 43V41C11 37.6863 13.6863 35 17 35Z"
        fill="#E0F2FE"
      />
      <path
        d="M17 25H39C42.3137 25 45 27.6863 45 31V33C45 36.3137 42.3137 39 39 39H17C13.6863 39 11 36.3137 11 33V31C11 27.6863 13.6863 25 17 25Z"
        fill="#F8FAFC"
        opacity="0.92"
      />
      <path
        d="M18 22H30M18 32H28M18 42H31"
        stroke="#0F172A"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="40" cy="22" r="2.5" fill="#06B6D4" />
      <circle cx="37" cy="32" r="2.5" fill="#06B6D4" />
      <circle cx="40" cy="42" r="2.5" fill="#06B6D4" />
      <path
        d="M29 47C37 46 45 41 49 31"
        stroke="#EC4899"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M45 30H52V37"
        stroke="#EC4899"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
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
          "flex shrink-0 items-center justify-center rounded-lg bg-[#18181B] text-[#18181B]",
          compact ? "size-11" : "size-12",
          markClassName,
        )}
      >
        <BrandMarkIcon className={compact ? "size-8" : "size-9"} />
      </div>
      {withLabel ? (
        <div className={cn("min-w-0", textClassName)}>
          <p className="font-editorial text-xl font-semibold text-foreground">
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
