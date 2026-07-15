import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { isHttpHref, isInternalHref } from "@fwqgo/core/utils";
import type { getActiveHomepageSlots } from "@/server/homepage/homepage-slots";
import { SafePostImage } from "@/features/public/components/safe-post-image";

export type ActiveHomepageSlot = Awaited<
  ReturnType<typeof getActiveHomepageSlots>
>[number];

function PromotionLink({
  slot,
  className,
  children,
}: {
  slot: ActiveHomepageSlot;
  className: string;
  children: ReactNode;
}) {
  const href = slot.resolvedTargetUrl?.trim();
  if (isInternalHref(href)) {
    return (
      <Link
        href={href}
        prefetch
        rel={slot.contentType === "post" ? undefined : "nofollow sponsored"}
        className={className}
      >
        {children}
      </Link>
    );
  }
  if (isHttpHref(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel={
          slot.contentType === "offer"
            || slot.contentType === "image_link"
            ? "nofollow sponsored noopener noreferrer"
            : "noopener noreferrer"
        }
        className={className}
      >
        {children}
      </a>
    );
  }
  return <div className={className}>{children}</div>;
}

export function HomepagePrimaryPromotion({
  slot,
  language = "zh",
}: {
  slot: ActiveHomepageSlot;
  language?: "zh" | "en";
}) {
  const imageUrl = slot.resolvedImageUrl?.trim() ?? null;

  return (
    <PromotionLink
      slot={slot}
      className="group relative block min-h-64 overflow-hidden rounded-lg border border-border/70 bg-foreground text-background shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {imageUrl ? (
        <SafePostImage
          src={imageUrl}
          alt={slot.resolvedAltText}
          priority
          sizes="(max-width: 1023px) 100vw, 330px"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground">
          <ImageIcon className="size-10" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/55" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        <Badge className="mb-2 border-white/20 bg-black/35 text-white hover:bg-black/35">
          {slot.contentType === "post"
            ? language === "en"
              ? "Featured article"
              : "推广文章"
            : slot.contentType === "offer"
              ? language === "en"
                ? "Featured offer"
                : "精选套餐"
              : language === "en"
                ? "Special pick"
                : "特别推荐"}
        </Badge>
        <h2 className="line-clamp-2 text-lg font-semibold leading-7">
          {slot.resolvedTitle}
        </h2>
        {slot.resolvedDescription ? (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/80">
            {slot.resolvedDescription}
          </p>
        ) : null}
      </div>
    </PromotionLink>
  );
}

export function HomepagePromotionGrid({
  slots,
}: {
  slots: ActiveHomepageSlot[];
}) {
  if (slots.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {slots.slice(0, 6).map((slot) => {
        const imageUrl = slot.resolvedImageUrl?.trim() ?? null;
        return (
          <PromotionLink
            key={slot.id}
            slot={slot}
            className="group overflow-hidden rounded-lg border border-border/70 bg-background transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="relative aspect-video overflow-hidden bg-muted">
              {imageUrl ? (
                <SafePostImage
                  src={imageUrl}
                  alt={slot.resolvedAltText}
                  sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="size-8" />
                </div>
              )}
            </div>
            <div className="p-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="line-clamp-2 text-sm font-semibold leading-6 text-foreground group-hover:text-primary">
                  {slot.resolvedTitle}
                </h3>
                <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              </div>
              {slot.resolvedDescription ? (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {slot.resolvedDescription}
                </p>
              ) : null}
            </div>
          </PromotionLink>
        );
      })}
    </div>
  );
}

export function HomepageSidebarPromotions({
  slots,
}: {
  slots: ActiveHomepageSlot[];
}) {
  if (slots.length === 0) return null;
  return (
    <div className="space-y-2">
      {slots.slice(0, 6).map((slot) => (
        <PromotionLink
          key={slot.id}
          slot={slot}
          className="group flex min-h-11 items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm transition-colors hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="line-clamp-2 font-medium text-foreground group-hover:text-primary">
            {slot.resolvedTitle}
          </span>
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
        </PromotionLink>
      ))}
    </div>
  );
}
