"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  FileText,
  Filter,
  FlaskConical,
  ShoppingCart,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isInternalHref, isSafePublicHref } from "@fwqgo/core/utils";
import {
  formatServerOfferAmount,
  resolveMonthlyPriceUsd,
} from "@fwqgo/core/server-offer-price";

type Offer = {
  id: number;
  title: string;
  providerName: string | null;
  productType: string | null;
  cpu: string | null;
  memory: string | null;
  storage: string | null;
  bandwidth: string | null;
  traffic: string | null;
  region: string | null;
  lineType: string | null;
  priceAmount: string | null;
  monthlyPriceUsd?: string | null;
  currency: string | null;
  billingCycle: string | null;
  promoCode: string | null;
  purchaseUrl: string | null;
  articleUrl: string | null;
  reviewUrl: string | null;
  status: string;
  lastCheckedAt?: Date | string | null;
  validUntil?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

type OfferLanguage = "zh" | "en";

const tableCopy = {
  zh: {
    status: {
      in_stock: "有货",
      out_of_stock: "没货",
      restocking: "补货",
      discontinued: "停售",
      preorder: "预售",
    },
    billingCycle: {
      monthly: "月付",
      quarterly: "季付",
      semiannual: "半年",
      yearly: "年付",
    },
    missingPrice: "待补充",
    invalidPrice: "待确认",
    unknownCycle: "周期待确认",
    notChecked: "未核验",
    buy: "购买",
    source: "来源",
    review: "测评",
    promoCode: "优惠码",
    price: "价格",
    regionLine: "地区 / 线路",
    regionMissing: "地区待补充",
    lineMissing: "线路待补充",
    dataStatus: "数据状态",
    lastChecked: "最近核验",
    validUntil: "有效期至",
    specs: "配置",
    specsMissing: "配置待补充",
    emptyTitle: "暂无结构化套餐",
    emptyDescription: "供应商官网采集或人工补充后，套餐会显示在这里。",
    filterTitle: "筛选套餐",
    showing: (shown: number, total: number) => `显示 ${shown} / ${total}`,
    searchPlaceholder: "搜索套餐、地区、线路、优惠码",
    provider: "商家",
    allProviders: "全部商家",
    statusFilter: "状态",
    allStatuses: "全部状态",
    region: "地区",
    allRegions: "全部地区",
    line: "线路",
    allLines: "全部线路",
    sort: "排序",
    priceAsc: "价格从低到高",
    priceDesc: "价格从高到低",
    latest: "最新优先",
    promotion: "优惠码",
    allPromotions: "全部优惠",
    withPromotion: "有优惠码",
    withoutPromotion: "无优惠码",
    currentShowing: (shown: number, total: number) =>
      `当前显示 ${shown} / ${total} 个套餐`,
    noMatchTitle: "没有匹配的套餐",
    noMatchDescription: "试试减少筛选条件，或改用地区、线路、商家关键词搜索。",
    package: "套餐",
    regionLineHeader: "地区/线路",
    entry: "入口",
    sortLabel: (value: string) => value,
  },
  en: {
    status: {
      in_stock: "In stock",
      out_of_stock: "Out of stock",
      restocking: "Restocking",
      discontinued: "Discontinued",
      preorder: "Pre-order",
    },
    billingCycle: {
      monthly: "Monthly",
      quarterly: "Quarterly",
      semiannual: "Semiannual",
      yearly: "Yearly",
    },
    missingPrice: "Not provided",
    invalidPrice: "Needs review",
    unknownCycle: "Billing cycle unavailable",
    notChecked: "Not checked",
    buy: "Buy",
    source: "Source",
    review: "Review",
    promoCode: "Promo code",
    price: "Price",
    regionLine: "Region / route",
    regionMissing: "Region unavailable",
    lineMissing: "Route unavailable",
    dataStatus: "Data status",
    lastChecked: "Last checked",
    validUntil: "Valid until",
    specs: "Specifications",
    specsMissing: "Specifications unavailable",
    emptyTitle: "No structured offers",
    emptyDescription:
      "Offers will appear here after supplier collection or manual entry.",
    filterTitle: "Filter offers",
    showing: (shown: number, total: number) => `Showing ${shown} / ${total}`,
    searchPlaceholder: "Search offers, regions, routes, or promo codes",
    provider: "Provider",
    allProviders: "All providers",
    statusFilter: "Status",
    allStatuses: "All statuses",
    region: "Region",
    allRegions: "All regions",
    line: "Route",
    allLines: "All routes",
    sort: "Sort",
    priceAsc: "Lowest price",
    priceDesc: "Highest price",
    latest: "Newest first",
    promotion: "Promo code",
    allPromotions: "All promotions",
    withPromotion: "With promo code",
    withoutPromotion: "Without promo code",
    currentShowing: (shown: number, total: number) =>
      `Showing ${shown} / ${total} offers`,
    noMatchTitle: "No matching offers",
    noMatchDescription:
      "Try fewer filters, or search by provider, region, or route.",
    package: "Offer",
    regionLineHeader: "Region / route",
    entry: "Actions",
    sortLabel: (value: string) => value,
  },
} as const;

function getTableCopy(language: OfferLanguage) {
  return tableCopy[language];
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function getStatusClassName(status: string) {
  if (status === "in_stock") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300";
  }

  if (status === "preorder" || status === "restocking") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300";
  }

  return "border-border bg-muted text-muted-foreground hover:bg-muted";
}

function formatPrice(offer: Offer, language: OfferLanguage) {
  const copy = getTableCopy(language);
  const priceAmount = cleanText(offer.priceAmount);
  if (!priceAmount) return copy.missingPrice;
  const amount = Number(priceAmount);
  if (!Number.isFinite(amount) || amount < 0) return copy.invalidPrice;

  const formattedAmount = formatServerOfferAmount({
    amount,
    currency: offer.currency,
  });
  if (!formattedAmount) return copy.invalidPrice;
  const cycle = offer.billingCycle
    ? (copy.billingCycle[offer.billingCycle as keyof typeof copy.billingCycle] ??
      offer.billingCycle)
    : copy.unknownCycle;
  return `${formattedAmount} / ${cycle}`;
}

function formatShortDate(
  value: Date | string | null | undefined,
  language: OfferLanguage,
) {
  const copy = getTableCopy(language);
  if (!value) return copy.notChecked;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return copy.notChecked;
  return date.toLocaleDateString(language === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getOfferFreshnessLabel(offer: Offer, language: OfferLanguage) {
  return formatShortDate(
    offer.lastCheckedAt ?? offer.updatedAt ?? offer.createdAt ?? null,
    language,
  );
}

function specsText(offer: Offer) {
  return [
    offer.cpu,
    offer.memory,
    offer.storage,
    offer.bandwidth,
    offer.traffic,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" · ");
}

function priceSortValue(offer: Offer) {
  return resolveMonthlyPriceUsd({
    monthlyPriceUsd: offer.monthlyPriceUsd,
    amount: offer.priceAmount,
    currency: offer.currency,
    billingCycle: offer.billingCycle,
  });
}

function compareOfferPrice(
  left: Offer,
  right: Offer,
  direction: "asc" | "desc",
) {
  const leftPrice = priceSortValue(left);
  const rightPrice = priceSortValue(right);

  if (leftPrice === null && rightPrice === null) return 0;
  if (leftPrice === null) return 1;
  if (rightPrice === null) return -1;
  return direction === "desc" ? rightPrice - leftPrice : leftPrice - rightPrice;
}

function getUniqueValues(values: Array<string | null>) {
  return [
    ...new Set(values.map((value) => value?.trim()).filter(Boolean)),
  ] as string[];
}

function SafeActionButton({
  href,
  icon,
  label,
  rel,
  variant = "outline",
}: {
  href: string | null;
  icon: ReactNode;
  label: string;
  rel?: string;
  variant?: "default" | "outline";
}) {
  if (!isSafePublicHref(href)) return null;

  return (
    <Button asChild size="sm" variant={variant} className="min-h-11 px-3">
      {isInternalHref(href) ? (
        <Link href={href} prefetch={false}>
          {icon}
          {label}
        </Link>
      ) : (
        <a href={href} target="_blank" rel={rel ?? "noopener noreferrer"}>
          {icon}
          {label}
        </a>
      )}
    </Button>
  );
}

function OfferActions({
  offer,
  language,
}: {
  offer: Offer;
  language: OfferLanguage;
}) {
  const copy = getTableCopy(language);
  const hasAnyAction =
    isSafePublicHref(offer.purchaseUrl) ||
    isSafePublicHref(offer.articleUrl) ||
    isSafePublicHref(offer.reviewUrl);

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
      <SafeActionButton
        href={cleanText(offer.purchaseUrl)}
        icon={<ShoppingCart className="size-4" />}
        label={copy.buy}
        rel="nofollow sponsored noopener noreferrer"
        variant="default"
      />
      <SafeActionButton
        href={cleanText(offer.articleUrl)}
        icon={<FileText className="size-4" />}
        label={copy.source}
      />
      <SafeActionButton
        href={cleanText(offer.reviewUrl)}
        icon={<FlaskConical className="size-4" />}
        label={copy.review}
      />
      {!hasAnyAction ? (
        <ArrowUpRight className="mt-2 size-4 text-muted-foreground" />
      ) : null}
    </div>
  );
}

function collectionHref(
  kind: "providers" | "regions" | "lines",
  value: string,
) {
  return `/servers/${kind}/${encodeURIComponent(value)}`;
}

function OfferMobileCard({
  offer,
  language,
}: {
  offer: Offer;
  language: OfferLanguage;
}) {
  const copy = getTableCopy(language);
  const providerName = cleanText(offer.providerName);
  const productType = cleanText(offer.productType);
  const promoCode = cleanText(offer.promoCode);
  const region = cleanText(offer.region);
  const lineType = cleanText(offer.lineType);

  return (
    <article className="space-y-4 rounded-lg border border-border/70 bg-background p-4 shadow-sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="min-w-0 flex-1 text-base font-semibold leading-6 text-foreground">
            {offer.title}
          </h2>
          <Badge variant="outline" className={getStatusClassName(offer.status)}>
            {copy.status[offer.status as keyof typeof copy.status] ?? offer.status}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {providerName ? (
            <Badge variant="secondary">
              <Link
                href={collectionHref("providers", providerName)}
                prefetch
                className="hover:underline"
              >
                {providerName}
              </Link>
            </Badge>
          ) : null}
          {productType ? <Badge variant="outline">{productType}</Badge> : null}
          {promoCode ? (
            <Badge className="bg-primary/10 font-mono text-primary hover:bg-primary/10">
              {copy.promoCode} {promoCode}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-md bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">{copy.price}</p>
          <p className="mt-1 font-semibold text-foreground">
            {formatPrice(offer, language)}
          </p>
        </div>
        <div className="rounded-md bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">{copy.regionLine}</p>
          <p className="mt-1 font-medium text-foreground">
            {region ? (
              <Link
                href={collectionHref("regions", region)}
                prefetch
                className="underline-offset-4 hover:text-primary hover:underline"
              >
                {region}
              </Link>
            ) : (
              copy.regionMissing
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lineType ? (
              <Link
                href={collectionHref("lines", lineType)}
                prefetch
                className="underline-offset-4 hover:text-primary hover:underline"
              >
                {lineType}
              </Link>
            ) : (
              copy.lineMissing
            )}
          </p>
        </div>
        <div className="rounded-md bg-muted/30 p-3 sm:col-span-2">
          <p className="text-xs text-muted-foreground">{copy.dataStatus}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {copy.lastChecked}: {getOfferFreshnessLabel(offer, language)}
            {offer.validUntil
              ? ` · ${copy.validUntil}: ${formatShortDate(offer.validUntil, language)}`
              : ""}
          </p>
        </div>
      </div>

      <div className="rounded-md bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">{copy.specs}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {specsText(offer) || copy.specsMissing}
        </p>
      </div>

      <div className="border-t border-border/70 pt-3">
        <OfferActions offer={offer} language={language} />
      </div>
    </article>
  );
}

export function ServerOfferTable({
  offers,
  language = "zh",
}: {
  offers: Offer[];
  language?: OfferLanguage;
}) {
  const copy = getTableCopy(language);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [status, setStatus] = useState("all");
  const [region, setRegion] = useState("all");
  const [lineType, setLineType] = useState("all");
  const [promoFilter, setPromoFilter] = useState("all");
  const [sortKey, setSortKey] = useState("price-asc");
  const providers = useMemo(
    () => getUniqueValues(offers.map((offer) => offer.providerName)),
    [offers],
  );
  const regions = useMemo(
    () => getUniqueValues(offers.map((offer) => offer.region)),
    [offers],
  );
  const lineTypes = useMemo(
    () => getUniqueValues(offers.map((offer) => offer.lineType)),
    [offers],
  );
  const activeProvider =
    provider === "all" || providers.includes(provider) ? provider : "all";
  const activeRegion =
    region === "all" || regions.includes(region) ? region : "all";
  const activeLineType =
    lineType === "all" || lineTypes.includes(lineType) ? lineType : "all";
  const filteredOffers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return offers
      .filter((offer) => {
        const haystack = [
          offer.title,
          offer.providerName,
          offer.region,
          offer.lineType,
          specsText(offer),
          offer.promoCode,
        ]
          .map(cleanText)
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          (!normalizedQuery || haystack.includes(normalizedQuery)) &&
          (activeProvider === "all" || offer.providerName === activeProvider) &&
          (status === "all" || offer.status === status) &&
          (activeRegion === "all" || offer.region === activeRegion) &&
          (activeLineType === "all" || offer.lineType === activeLineType) &&
          (promoFilter === "all" ||
            (promoFilter === "with" && Boolean(cleanText(offer.promoCode))) ||
            (promoFilter === "without" && !cleanText(offer.promoCode)))
        );
      })
      .sort((left, right) => {
        if (sortKey === "price-desc") {
          return compareOfferPrice(left, right, "desc");
        }

        if (sortKey === "new-desc") {
          return right.id - left.id;
        }

        return compareOfferPrice(left, right, "asc");
      });
  }, [
    activeLineType,
    activeProvider,
    activeRegion,
    offers,
    promoFilter,
    query,
    sortKey,
    status,
  ]);

  if (offers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
        <p className="text-sm font-medium text-foreground">{copy.emptyTitle}</p>
        <p className="mt-2 text-sm text-muted-foreground">{copy.emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/70 bg-background p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Filter className="size-4 text-primary" />
            {copy.filterTitle}
          </div>
          <span className="text-xs text-muted-foreground">
            {copy.showing(filteredOffers.length, offers.length)}
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_145px_145px_145px_145px_145px_145px]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            className="min-h-11 md:col-span-2 xl:col-span-1"
          />
          <Select value={activeProvider} onValueChange={setProvider}>
            <SelectTrigger className="min-h-11">
              <SelectValue placeholder={copy.provider} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{copy.allProviders}</SelectItem>
              {providers.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="min-h-11">
              <SelectValue placeholder={copy.statusFilter} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{copy.allStatuses}</SelectItem>
              {Object.entries(copy.status).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={activeRegion} onValueChange={setRegion}>
            <SelectTrigger className="min-h-11">
              <SelectValue placeholder={copy.region} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{copy.allRegions}</SelectItem>
              {regions.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={activeLineType} onValueChange={setLineType}>
            <SelectTrigger className="min-h-11">
              <SelectValue placeholder={copy.line} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{copy.allLines}</SelectItem>
              {lineTypes.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger className="min-h-11">
              <SelectValue placeholder={copy.sort} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="price-asc">{copy.priceAsc}</SelectItem>
              <SelectItem value="price-desc">{copy.priceDesc}</SelectItem>
              <SelectItem value="new-desc">{copy.latest}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={promoFilter} onValueChange={setPromoFilter}>
            <SelectTrigger className="min-h-11">
              <SelectValue placeholder={copy.promotion} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{copy.allPromotions}</SelectItem>
              <SelectItem value="with">{copy.withPromotion}</SelectItem>
              <SelectItem value="without">{copy.withoutPromotion}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {copy.currentShowing(filteredOffers.length, offers.length)}
        </span>
        <span className="rounded-full bg-muted/40 px-3 py-1 text-xs">
          {sortKey === "price-asc"
            ? copy.priceAsc
            : sortKey === "price-desc"
              ? copy.priceDesc
              : copy.latest}
        </span>
      </div>
      {filteredOffers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">{copy.noMatchTitle}</p>
          <p className="mt-2 text-sm text-muted-foreground">{copy.noMatchDescription}</p>
        </div>
      ) : null}
      <div className="grid gap-3 md:hidden">
        {filteredOffers.map((offer) => (
          <OfferMobileCard key={offer.id} offer={offer} language={language} />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-border/70 bg-background shadow-sm md:block">
        <table className="w-full min-w-[920px] table-fixed text-[13px]">
          <thead className="border-b border-border/70 bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-[25%] px-3 py-3 font-medium">{copy.package}</th>
              <th className="w-[15%] px-3 py-3 font-medium">{copy.price}</th>
              <th className="w-[14%] px-3 py-3 font-medium">{copy.regionLineHeader}</th>
              <th className="w-[24%] px-3 py-3 font-medium">{copy.specs}</th>
              <th className="w-[9%] px-3 py-3 font-medium">{copy.statusFilter}</th>
              <th className="w-[13%] px-3 py-3 text-right font-medium">{copy.entry}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {filteredOffers.map((offer) => (
              <tr key={offer.id} className="align-top hover:bg-muted/20">
                <td className="px-3 py-3">
                  <div className="space-y-2">
                    <p className="line-clamp-2 font-medium leading-5 text-foreground">
                      {offer.title}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {offer.providerName ? (
                        <Badge variant="secondary">
                          <Link
                            href={collectionHref(
                              "providers",
                              offer.providerName,
                            )}
                            prefetch
                            className="hover:underline"
                          >
                            {offer.providerName}
                          </Link>
                        </Badge>
                      ) : null}
                      {offer.productType ? (
                        <Badge variant="outline">{offer.productType}</Badge>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <p className="font-semibold tabular-nums leading-5 text-foreground">
                    {formatPrice(offer, language)}
                  </p>
                  {offer.promoCode ? (
                    <p className="mt-2 text-xs">
                      <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono font-medium text-primary">
                        {offer.promoCode}
                      </span>
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {copy.lastChecked}: {getOfferFreshnessLabel(offer, language)}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p className="font-medium leading-5">
                    {offer.region ? (
                      <Link
                        href={collectionHref("regions", offer.region)}
                        prefetch
                        className="underline-offset-4 hover:text-primary hover:underline"
                      >
                        {offer.region}
                      </Link>
                    ) : (
                      copy.regionMissing
                    )}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {offer.lineType ? (
                      <Link
                        href={collectionHref("lines", offer.lineType)}
                        prefetch
                        className="underline-offset-4 hover:text-primary hover:underline"
                      >
                        {offer.lineType}
                      </Link>
                    ) : (
                      copy.lineMissing
                    )}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p className="line-clamp-3 leading-5 text-muted-foreground">
                    {specsText(offer) || copy.specsMissing}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <Badge
                    variant="outline"
                    className={getStatusClassName(offer.status)}
                  >
                    {copy.status[offer.status as keyof typeof copy.status] ??
                      offer.status}
                  </Badge>
                </td>
                <td className="px-3 py-3">
                  <OfferActions offer={offer} language={language} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
