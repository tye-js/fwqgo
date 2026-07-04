import Link from "next/link";
import type { ComponentProps } from "react";
import { ArrowRight, ShoppingCart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
}: {
  title?: string;
  description?: string;
  offers: Offer[];
  language?: "zh" | "en";
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
          article: "Article",
        }
      : {
          all: "全部比价",
          providerPending: "商家待补充",
          regionPending: "地区待补充",
          linePending: "线路待补充",
          buy: "购买链接",
          article: "推广文章",
        };

  return (
    <Card className="border-border/70 bg-background shadow-sm">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ShoppingCart className="size-4 text-accent" />
              {title}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
          <Link
            href="/servers"
            prefetch
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border/70 px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-accent/30 hover:bg-accent/5 hover:text-accent"
          >
            {copy.all}
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {offers.slice(0, 4).map((offer) => (
            <div
              key={offer.id}
              className="rounded-lg border border-border/70 bg-muted/20 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-medium leading-6">
                    {offer.title}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {offer.providerName ?? copy.providerPending} ·{" "}
                    {offer.region ?? copy.regionPending} ·{" "}
                    {offer.lineType ?? copy.linePending}
                  </p>
                </div>
                <Badge>{formatOfferPrice(offer, language)}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {isHttpHref(offer.purchaseUrl) ? (
                  <a
                    href={offer.purchaseUrl}
                    target="_blank"
                    rel="nofollow sponsored noopener noreferrer"
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {copy.buy}
                  </a>
                ) : isInternalHref(offer.purchaseUrl) ? (
                  <Link
                    href={offer.purchaseUrl}
                    prefetch={false}
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {copy.buy}
                  </Link>
                ) : null}
                {isInternalHref(offer.articleUrl) ? (
                  <Link
                    href={offer.articleUrl}
                    prefetch
                    className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {copy.article}
                  </Link>
                ) : isHttpHref(offer.articleUrl) ? (
                  <a
                    href={offer.articleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {copy.article}
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
