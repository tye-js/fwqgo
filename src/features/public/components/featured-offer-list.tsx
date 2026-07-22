import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, FileText, ShoppingCart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatServerOfferAmount } from "@fwqgo/core/server-offer-price";
import { cn, isHttpHref, isInternalHref } from "@fwqgo/core/utils";

type PublicLanguage = "zh" | "en";

export type FeaturedOffer = {
  id: number;
  title: string;
  providerName: string | null;
  region: string | null;
  lineType: string | null;
  priceAmount: string | null;
  currency: string | null;
  billingCycle: string | null;
  promoCode: string | null;
  purchaseUrl: string | null;
  articleUrl: string | null;
  status: string;
};

const listCopy: Record<
  PublicLanguage,
  {
    buy: string;
    article: string;
    promo: string;
    metaFallback: string;
    pricePending: string;
    priceInvalid: string;
    cyclePending: string;
    empty: string;
    cycles: Record<string, string>;
    status: Record<string, string>;
  }
> = {
  zh: {
    buy: "购买",
    article: "文章",
    promo: "优惠码",
    metaFallback: "套餐信息待补充",
    pricePending: "价格待补充",
    priceInvalid: "价格待确认",
    cyclePending: "周期待确认",
    empty: "暂无可展示的套餐，可以先打开比价工具查看全部数据。",
    cycles: {
      monthly: "月付",
      quarterly: "季付",
      semiannual: "半年付",
      yearly: "年付",
    },
    status: {
      in_stock: "有货",
      preorder: "预售",
      restocking: "补货",
      out_of_stock: "没货",
      discontinued: "停售",
    },
  },
  en: {
    buy: "Buy",
    article: "Article",
    promo: "Code",
    metaFallback: "Details pending",
    pricePending: "Price pending",
    priceInvalid: "Price to confirm",
    cyclePending: "cycle pending",
    empty: "No offers to show yet. Open the comparison tool for the full list.",
    cycles: {
      monthly: "mo",
      quarterly: "quarter",
      semiannual: "half-year",
      yearly: "year",
    },
    status: {
      in_stock: "In stock",
      preorder: "Preorder",
      restocking: "Restocking",
      out_of_stock: "Out of stock",
      discontinued: "Discontinued",
    },
  },
};

function statusClassName(status: string) {
  if (status === "in_stock") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }

  if (status === "preorder" || status === "restocking") {
    return "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";
  }

  return "border-border bg-muted text-muted-foreground hover:bg-muted";
}

function formatOfferPrice(offer: FeaturedOffer, language: PublicLanguage) {
  const copy = listCopy[language];
  const raw = offer.priceAmount?.trim();
  if (!raw) return copy.pricePending;

  const formattedAmount = formatServerOfferAmount({
    amount: raw,
    currency: offer.currency,
  });
  if (!formattedAmount) return copy.priceInvalid;

  const cycle = offer.billingCycle
    ? (copy.cycles[offer.billingCycle] ?? offer.billingCycle)
    : copy.cyclePending;

  return `${formattedAmount} / ${cycle}`;
}

function SafeOfferLink({
  href,
  className,
  children,
  sponsored = false,
}: {
  href: string | null | undefined;
  className: string;
  children: ReactNode;
  sponsored?: boolean;
}) {
  const safeHref = href?.trim();
  if (!safeHref) return null;

  if (isInternalHref(safeHref)) {
    return (
      <Link href={safeHref} prefetch={false} className={className}>
        {children}
      </Link>
    );
  }

  if (isHttpHref(safeHref)) {
    return (
      <a
        href={safeHref}
        target="_blank"
        rel={
          sponsored
            ? "nofollow sponsored noopener noreferrer"
            : "noopener noreferrer"
        }
        className={className}
      >
        {children}
      </a>
    );
  }

  return null;
}

export function FeaturedOfferList({
  offers,
  language = "zh",
}: {
  offers: FeaturedOffer[];
  language?: PublicLanguage;
}) {
  const copy = listCopy[language];

  if (offers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
        {copy.empty}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/70 rounded-lg border border-border/70 bg-background shadow-sm">
      {offers.map((offer) => {
        const meta = [offer.providerName, offer.region, offer.lineType]
          .map((item) => item?.trim())
          .filter(Boolean)
          .join(" · ");

        return (
          <li
            key={offer.id}
            className="grid gap-3 p-4 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 flex-1 basis-52 truncate text-sm font-semibold leading-6 text-foreground">
                  {offer.title}
                </h3>
                <Badge
                  variant="outline"
                  className={cn("shrink-0", statusClassName(offer.status))}
                >
                  {copy.status[offer.status] ?? offer.status}
                </Badge>
              </div>
              <p className="mt-1 truncate text-xs leading-5 text-muted-foreground">
                {meta || copy.metaFallback}
                {offer.promoCode ? (
                  <span className="ml-2 rounded-sm bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                    {copy.promo} {offer.promoCode}
                  </span>
                ) : null}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end">
              <p className="text-base font-semibold tabular-nums tracking-tight text-foreground">
                {formatOfferPrice(offer, language)}
              </p>
              <div className="flex gap-2">
                <SafeOfferLink
                  href={offer.purchaseUrl}
                  sponsored
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:px-3"
                >
                  <ShoppingCart className="size-3.5" />
                  {copy.buy}
                </SafeOfferLink>
                <SafeOfferLink
                  href={offer.articleUrl}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:px-3"
                >
                  <FileText className="size-3.5" />
                  {copy.article}
                  <ArrowUpRight className="size-3" />
                </SafeOfferLink>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
