"use client";

import { useMemo, useState } from "react";
import Link, { PublicAnchor } from "@/features/public/components/public-link";
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
import {
  isInternalHref,
  isOutboundShortLinkHref,
  isSafePublicHref,
} from "@fwqgo/core/utils";
import {
  formatServerOfferAmount,
  resolveMonthlyPriceUsd,
} from "@fwqgo/core/server-offer-price";

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

type OfferActionProps = {
  prices: OfferPrice[];
  fallbackPrice: string | null;
  fallbackMonthlyPriceUsd: string | null;
  fallbackCurrency: string | null;
  fallbackCycle: string | null;
  purchaseUrl: string | null;
  promoCode: string | null;
  articleUrl: string | null;
  reviewUrl: string | null;
  /**
   * 套餐标题，只用于给下面的计费周期下拉提供**可访问名称**。
   *
   * 列表页上每个套餐都有一个这样的下拉，此前既没有可见标签也没有 `aria-label`，
   * 读屏用户听到的是一串没有名字的「combobox」（实测 `/servers` 一页 40+ 个）。
   * 带上标题后每个下拉都能被区分。
   */
  offerTitle: string;
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
  return (
    formatServerOfferAmount({ amount, currency }) ?? `${amount} ${currency}`
  );
}

function SafeLinkButton({
  href,
  children,
  variant = "outline",
  ariaLabel,
  sponsored = false,
  newTab = false,
}: {
  href: string | null | undefined;
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost";
  ariaLabel?: string;
  sponsored?: boolean;
  newTab?: boolean;
}) {
  if (!isSafePublicHref(href)) return null;

  const internal = isInternalHref(href);
  const shortLink = isOutboundShortLinkHref(href);
  const rel = sponsored
    ? "nofollow sponsored noopener noreferrer"
    : newTab
      ? "noopener noreferrer"
      : undefined;
  const anchorRel = rel ?? (internal ? undefined : "noopener noreferrer");
  const anchorTarget = internal ? (newTab ? "_blank" : undefined) : "_blank";

  return (
    <Button
      asChild
      size="sm"
      variant={variant}
      // 桌面表格（`server-inventory-results` 的 xl 表格）一屏要放尽量多行，所以那里
      // 把按钮压到 32px；窄屏走卡片布局，仍然按 44px 的触控目标来。
      // `xl:` 变体排在基础工具类之后，所以能盖住 Button 基础样式里的 `min-h-11`。
      className="min-h-11 xl:h-8 xl:min-h-8 xl:px-2"
      aria-label={ariaLabel}
    >
      {internal && !shortLink ? (
        <Link href={href} target={newTab ? "_blank" : undefined} rel={rel}>
          {children}
        </Link>
      ) : (
        <PublicAnchor href={href} target={anchorTarget} rel={anchorRel}>
          {children}
        </PublicAnchor>
      )}
    </Button>
  );
}

/**
 * 计费周期选中态。价格列（下拉或纯文本）和操作列（购买按钮）是**两列不同的
 * `<td>`**，但购买链接跟着选中周期走，所以状态收在这里共享，两边都从它派生。
 */
function useOfferSelection({
  prices,
  fallbackPrice,
  fallbackMonthlyPriceUsd,
  fallbackCurrency,
  fallbackCycle,
  purchaseUrl,
}: OfferActionProps) {
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
  const selectedValue = selected ? String(selected.id) : "";
  const selectedPurchaseUrl = selected?.purchaseUrl ?? purchaseUrl;
  const selectedMonthlyPrice = selected
    ? resolveMonthlyPriceUsd({
        monthlyPriceUsd: selected.monthlyPriceUsd,
        amount: selected.amount,
        currency: selected.currency,
        billingCycle: selected.billingCycle,
      })
    : null;

  return {
    options,
    selected,
    selectedValue,
    setSelectedId,
    selectedPurchaseUrl,
    selectedMonthlyPrice,
  };
}

type Selection = ReturnType<typeof useOfferSelection>;

/**
 * 计费周期 + 月折算价。
 *
 * @param narrow 价格列（独立的窄 `<td>`）里传 `true`：下拉宽度跟随列宽、不再设
 * 最小宽度，多周期与月价仍然上下两行（列宽放不下并排）。
 */
function PriceSelection({
  selection,
  offerTitle,
  narrow = false,
}: {
  selection: Selection;
  offerTitle: string;
  narrow?: boolean;
}) {
  const {
    options,
    selected,
    selectedValue,
    setSelectedId,
    selectedMonthlyPrice,
  } = selection;

  if (!selected) {
    return <p className="text-xs text-muted-foreground">价格待确认</p>;
  }

  return (
    <div className={narrow ? "space-y-0.5" : "space-y-1 xl:space-y-0.5"}>
      {options.length > 1 ? (
        <Select value={selectedValue} onValueChange={setSelectedId}>
          <SelectTrigger
            className={
              narrow
                ? "min-h-11 w-full text-xs xl:min-h-8"
                : "min-h-11 w-full text-xs sm:min-w-[150px] xl:min-h-8"
            }
            aria-label={`${offerTitle} 计费周期`}
          >
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
        <p className="font-semibold leading-4 tabular-nums text-foreground">
          {cycleLabels[selected.billingCycle] ?? selected.billingCycle} ·{" "}
          {formatMoney(selected.amount, selected.currency)}
        </p>
      )}
      {selectedMonthlyPrice !== null ? (
        <p className="text-xs leading-none tabular-nums text-muted-foreground">
          约 ${selectedMonthlyPrice.toFixed(2)} / 月
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">月价待确认</p>
      )}
    </div>
  );
}

/** 优惠码：桌面表格里挪到「操作」列，卡片布局里仍在价格下面。 */
function PromoCodeButton({ promoCode }: { promoCode: string }) {
  async function copyPromoCode() {
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
    <button
      type="button"
      onClick={copyPromoCode}
      className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1.5 text-left font-mono text-xs font-medium text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:min-h-7 xl:py-0.5"
    >
      <span className="min-w-0 break-all">{promoCode}</span>
      <Copy className="size-3.5 shrink-0" />
    </button>
  );
}

function ActionLinkButtons({
  selection,
  articleUrl,
  reviewUrl,
}: {
  selection: Selection;
  articleUrl: string | null;
  reviewUrl: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      <SafeLinkButton
        href={selection.selectedPurchaseUrl}
        variant="default"
        sponsored
        newTab
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
  );
}

/**
 * 卡片布局（窄屏）：价格、优惠码、按钮纵向叠在一个块里。
 */
export function ServerInventoryOfferActions(props: OfferActionProps) {
  const selection = useOfferSelection(props);
  return (
    <div className="w-full min-w-0 space-y-2 sm:w-auto xl:space-y-1">
      <PriceSelection selection={selection} offerTitle={props.offerTitle} />
      {props.promoCode ? <PromoCodeButton promoCode={props.promoCode} /> : null}
      <ActionLinkButtons
        selection={selection}
        articleUrl={props.articleUrl}
        reviewUrl={props.reviewUrl}
      />
    </div>
  );
}

/**
 * 桌面表格布局（xl 以上）：价格、操作各占一列 `<td>`，优惠码挪到操作列。
 *
 * 为什么是一个组件渲染两个 `<td>`：购买链接跟着选中的计费周期走，两个单元格
 * 必须共享同一份选中态，而 `<tr>` 在服务端组件里、没法挂 `useState`。
 */
export function ServerInventoryPriceActionCells(props: OfferActionProps) {
  const selection = useOfferSelection(props);
  return (
    <>
      <td className="px-3 py-1.5">
        <PriceSelection
          selection={selection}
          offerTitle={props.offerTitle}
          narrow
        />
      </td>
      <td className="px-3 py-1.5">
        <div className="space-y-1.5">
          {props.promoCode ? (
            <PromoCodeButton promoCode={props.promoCode} />
          ) : null}
          <ActionLinkButtons
            selection={selection}
            articleUrl={props.articleUrl}
            reviewUrl={props.reviewUrl}
          />
        </div>
      </td>
    </>
  );
}
