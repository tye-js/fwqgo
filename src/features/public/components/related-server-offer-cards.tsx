import Link from "next/link";
import type { ComponentProps } from "react";
import { ArrowRight, ExternalLink, ShoppingCart } from "lucide-react";

import { type ServerOfferTable } from "@/features/public/components/server-offer-table";
import { isHttpHref, isInternalHref } from "@fwqgo/core/utils";

type Offer = ComponentProps<typeof ServerOfferTable>["offers"][number];

function formatOfferPrice(offer: Offer, language: "zh" | "en") {
  if (!offer.priceAmount) {
    return language === "en" ? "Price pending" : "价格待补充";
  }
  const amount = Number(offer.priceAmount);
  if (!Number.isFinite(amount)) {
    return language === "en" ? "Price to confirm" : "价格待确认";
  }
  return `${offer.currency === "CNY" ? "¥" : "$"}${amount.toFixed(2)}`;
}

export function RelatedServerOfferCards({
  title = "相关服务器套餐",
  description = "根据当前主题匹配的结构化套餐，适合继续比较价格、地区和线路。",
  offers,
  language = "zh",
  compact = false,
}: {
  title?: string;
  description?: string;
  offers: Offer[];
  language?: "zh" | "en";
  compact?: boolean;
}) {
  if (offers.length === 0) return null;
  const copy =
    language === "en"
      ? {
          all: "All comparisons",
          providerPending: "Provider pending",
          regionPending: "Region pending",
          linePending: "Line pending",
          buy: "Buy",
          article: "Source",
        }
      : {
          all: "全部比价",
          providerPending: "商家待补充",
          regionPending: "地区待补充",
          linePending: "线路待补充",
          buy: "购买链接",
          article: "来源文章",
        };

  return (
    <section
      className={
        compact
          ? "rounded-lg border border-border/70 bg-muted/20 p-3 md:p-4"
          : "rounded-lg border border-border/70 bg-muted/20 p-4 md:p-5"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShoppingCart className="size-4 text-primary" aria-hidden="true" />
            {title}
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground md:text-sm md:leading-6">
            {description}
          </p>
        </div>
        <Link
          href="/servers"
          prefetch
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm text-sm font-semibold text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {copy.all}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-3 grid overflow-hidden rounded-md border border-border/70 bg-background md:grid-cols-2">
        {offers.slice(0, compact ? 2 : 4).map((offer, index) => (
          <div
            key={offer.id}
            className={`min-w-0 px-3 py-3.5 md:px-4 ${
              index > 0 ? "border-t border-border/60" : ""
            } ${index === 1 ? "md:border-t-0" : ""} ${
              index % 2 === 1 ? "md:border-l" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold leading-6 text-foreground">
                  {offer.title}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {offer.providerName ?? copy.providerPending} ·{" "}
                  {offer.region ?? copy.regionPending} ·{" "}
                  {offer.lineType ?? copy.linePending}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {formatOfferPrice(offer, language)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              {isHttpHref(offer.purchaseUrl) ? (
                <a
                  href={offer.purchaseUrl}
                  target="_blank"
                  rel="nofollow sponsored noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary underline underline-offset-4 transition-colors hover:text-primary/80 md:min-h-8"
                >
                  {copy.buy}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : isInternalHref(offer.purchaseUrl) ? (
                <Link
                  href={offer.purchaseUrl}
                  prefetch={false}
                  className="inline-flex min-h-11 items-center text-xs font-semibold text-primary underline underline-offset-4 transition-colors hover:text-primary/80 md:min-h-8"
                >
                  {copy.buy}
                </Link>
              ) : null}
              {isInternalHref(offer.articleUrl) ? (
                <Link
                  href={offer.articleUrl}
                  prefetch
                  className="inline-flex min-h-11 items-center text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline md:min-h-8"
                >
                  {copy.article}
                </Link>
              ) : isHttpHref(offer.articleUrl) ? (
                <a
                  href={offer.articleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline md:min-h-8"
                >
                  {copy.article}
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
