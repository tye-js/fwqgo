"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, FileText, FlaskConical } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isInternalHref, isSafePublicHref } from "@fwqgo/core/utils";

type OfferPrice = {
  id: number;
  billingCycle: string;
  termMonths: number;
  amount: string;
  originalAmount: string | null;
  currency: string;
  monthlyPriceUsd: string;
  purchaseUrl: string | null;
};

const cycleLabels: Record<string, string> = {
  monthly: "月付",
  quarterly: "季付",
  semiannual: "半年付",
  yearly: "年付",
  biennial: "两年付",
  triennial: "三年付",
};

function formatMoney(amount: string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  return `${currency === "CNY" ? "¥" : "$"}${value.toFixed(2)}`;
}

function SafeLinkButton({
  href,
  children,
  variant = "outline",
  ariaLabel,
  sponsored = false,
}: {
  href: string | null | undefined;
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost";
  ariaLabel?: string;
  sponsored?: boolean;
}) {
  if (!isSafePublicHref(href)) return null;

  return (
    <Button asChild size="sm" variant={variant} aria-label={ariaLabel}>
      {isInternalHref(href) ? (
        <Link href={href} rel={sponsored ? "nofollow sponsored" : undefined}>
          {children}
        </Link>
      ) : (
        <a
          href={href}
          target="_blank"
          rel={
            sponsored
              ? "nofollow sponsored noopener noreferrer"
              : "noopener noreferrer"
          }
        >
          {children}
        </a>
      )}
    </Button>
  );
}

export function ServerInventoryOfferActions({
  prices,
  fallbackPrice,
  fallbackMonthlyPriceUsd,
  fallbackCurrency,
  fallbackCycle,
  purchaseUrl,
  promoCode,
  articleUrl,
  reviewUrl,
}: {
  prices: OfferPrice[];
  fallbackPrice: string | null;
  fallbackMonthlyPriceUsd: string | null;
  fallbackCurrency: string | null;
  fallbackCycle: string | null;
  purchaseUrl: string | null;
  promoCode: string | null;
  articleUrl: string | null;
  reviewUrl: string | null;
}) {
  const options = useMemo(() => {
    if (prices.length > 0) return prices;
    if (!fallbackPrice) return [];
    return [
      {
        id: -1,
        billingCycle: fallbackCycle ?? "monthly",
        termMonths: 1,
        amount: fallbackPrice,
        originalAmount: null,
        currency: fallbackCurrency ?? "USD",
        monthlyPriceUsd: fallbackMonthlyPriceUsd ?? fallbackPrice,
        purchaseUrl,
      },
    ];
  }, [
    fallbackCurrency,
    fallbackCycle,
    fallbackMonthlyPriceUsd,
    fallbackPrice,
    prices,
    purchaseUrl,
  ]);
  const [selectedId, setSelectedId] = useState(String(options[0]?.id ?? -1));
  const selected =
    options.find((option) => String(option.id) === selectedId) ?? options[0];
  const selectedPurchaseUrl = selected?.purchaseUrl ?? purchaseUrl;

  async function copyPromoCode() {
    if (!promoCode) return;
    try {
      await navigator.clipboard.writeText(promoCode);
      toast.success("优惠码已复制", { description: promoCode });
    } catch {
      toast.error("复制优惠码失败", {
        description: "请手动选择优惠码后复制。",
      });
    }
  }

  return (
    <div className="space-y-2">
      {selected ? (
        <div className="space-y-1">
          {options.length > 1 ? (
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="h-9 min-w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((price) => (
                  <SelectItem key={price.id} value={String(price.id)}>
                    {cycleLabels[price.billingCycle] ?? price.billingCycle} ·{" "}
                    {formatMoney(price.amount, price.currency)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="font-semibold tabular-nums text-foreground">
              {cycleLabels[selected.billingCycle] ?? selected.billingCycle} ·{" "}
              {formatMoney(selected.amount, selected.currency)}
            </p>
          )}
          <p className="text-xs tabular-nums text-muted-foreground">
            约 ${Number(selected.monthlyPriceUsd).toFixed(2)} / 月
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">价格待确认</p>
      )}

      {promoCode ? (
        <button
          type="button"
          onClick={copyPromoCode}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-primary/10 px-2 font-mono text-xs font-medium text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {promoCode}
          <Copy className="size-3.5" />
        </button>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <SafeLinkButton
          href={selectedPurchaseUrl}
          variant="default"
          sponsored
        >
          购买
          <ExternalLink className="size-3.5" />
        </SafeLinkButton>
        <SafeLinkButton href={articleUrl} ariaLabel="打开推广文章">
          <FileText className="size-3.5" />
          <span className="sm:hidden xl:inline">推广</span>
        </SafeLinkButton>
        <SafeLinkButton href={reviewUrl} ariaLabel="打开测评文章">
          <FlaskConical className="size-3.5" />
          <span className="sm:hidden xl:inline">测评</span>
        </SafeLinkButton>
      </div>
    </div>
  );
}
