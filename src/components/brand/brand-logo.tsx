import { cn } from "@fwqgo/core/utils";

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
      <rect x="4" y="4" width="56" height="56" rx="17" fill="#0F172A" />
      <rect
        x="4.75"
        y="4.75"
        width="54.5"
        height="54.5"
        rx="16.25"
        stroke="#1E293B"
        strokeWidth="1.5"
      />
      <path
        d="M16 16.5H43C45.2091 16.5 47 18.2909 47 20.5V21.5C47 23.7091 45.2091 25.5 43 25.5H16C13.7909 25.5 12 23.7091 12 21.5V20.5C12 18.2909 13.7909 16.5 16 16.5Z"
        fill="#F8FAFC"
      />
      <path
        d="M16 27.5H43C45.2091 27.5 47 29.2909 47 31.5V32.5C47 34.7091 45.2091 36.5 43 36.5H16C13.7909 36.5 12 34.7091 12 32.5V31.5C12 29.2909 13.7909 27.5 16 27.5Z"
        fill="#E0F2FE"
      />
      <path
        d="M16 38.5H43C45.2091 38.5 47 40.2909 47 42.5V43.5C47 45.7091 45.2091 47.5 43 47.5H16C13.7909 47.5 12 45.7091 12 43.5V42.5C12 40.2909 13.7909 38.5 16 38.5Z"
        fill="#F8FAFC"
      />
      <path
        d="M19 21H31M19 32H29M19 43H32"
        stroke="#0F172A"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
      <path
        d="M42 21C48 24 50 28.25 50 32C50 35.75 48 40 42 43"
        stroke="#38BDF8"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="40.5" cy="21" r="2.75" fill="#0EA5E9" />
      <circle cx="39" cy="32" r="2.75" fill="#0EA5E9" />
      <circle cx="40.5" cy="43" r="2.75" fill="#0EA5E9" />
      <path
        d="M48.25 32H52"
        stroke="#7DD3FC"
        strokeWidth="3"
        strokeLinecap="round"
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
          "flex shrink-0 items-center justify-center text-[#0F172A]",
          compact ? "size-11" : "size-12",
          markClassName,
        )}
      >
        <BrandMarkIcon className={compact ? "size-8" : "size-9"} />
      </div>
      {withLabel ? (
        <div className={cn("min-w-0", textClassName)}>
          <p className="font-editorial text-xl font-semibold tracking-tight text-foreground">
            服务器<span className="text-primary">GO</span>
          </p>
          <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
            Cloud Infra Research
          </p>
        </div>
      ) : null}
    </div>
  );
}
