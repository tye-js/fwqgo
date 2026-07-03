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
import { isInternalHref } from "@fwqgo/core/utils";

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
  currency: string | null;
  billingCycle: string | null;
  promoCode: string | null;
  purchaseUrl: string | null;
  articleUrl: string | null;
  reviewUrl: string | null;
  status: string;
};

const offerStatusLabels: Record<string, string> = {
  in_stock: "有货",
  out_of_stock: "没货",
  restocking: "补货",
  discontinued: "停售",
  preorder: "预售",
};

const billingCycleLabels: Record<string, string> = {
  monthly: "月付",
  quarterly: "季付",
  semiannual: "半年",
  yearly: "年付",
};

function getStatusClassName(status: string) {
  if (status === "in_stock") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }

  if (status === "preorder" || status === "restocking") {
    return "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";
  }

  return "border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-100";
}

function formatPrice(offer: Offer) {
  if (!offer.priceAmount) return "待补充";
  const amount = Number(offer.priceAmount);
  if (!Number.isFinite(amount)) return "待确认";

  const currency = offer.currency === "CNY" ? "¥" : "$";
  const cycle = offer.billingCycle
    ? billingCycleLabels[offer.billingCycle] ?? offer.billingCycle
    : "周期待确认";
  return `${currency}${amount.toFixed(2)} / ${cycle}`;
}

function specsText(offer: Offer) {
  return [offer.cpu, offer.memory, offer.storage, offer.bandwidth, offer.traffic]
    .filter(Boolean)
    .join(" · ");
}

function priceSortValue(value: string | null) {
  if (!value) return Infinity;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : Infinity;
}

function getUniqueValues(values: Array<string | null>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
}

function OfferActions({ offer }: { offer: Offer }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {offer.purchaseUrl ? (
        <Button asChild size="sm" className="min-h-9 px-3">
          <a href={offer.purchaseUrl} target="_blank" rel="nofollow noopener noreferrer">
            <ShoppingCart className="size-4" />
            购买
          </a>
        </Button>
      ) : null}
      {offer.articleUrl ? (
        <Button asChild size="sm" variant="outline" className="min-h-9 px-3">
          {isInternalHref(offer.articleUrl) ? (
            <Link href={offer.articleUrl} prefetch>
              <FileText className="size-4" />
              推广
            </Link>
          ) : (
            <a
              href={offer.articleUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText className="size-4" />
              推广
            </a>
          )}
        </Button>
      ) : null}
      {offer.reviewUrl ? (
        <Button asChild size="sm" variant="outline" className="min-h-9 px-3">
          {isInternalHref(offer.reviewUrl) ? (
            <Link href={offer.reviewUrl} prefetch>
              <FlaskConical className="size-4" />
              测评
            </Link>
          ) : (
            <a
              href={offer.reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FlaskConical className="size-4" />
              测评
            </a>
          )}
        </Button>
      ) : null}
      {!offer.purchaseUrl && !offer.articleUrl && !offer.reviewUrl ? (
        <ArrowUpRight className="mt-2 size-4 text-muted-foreground" />
      ) : null}
    </div>
  );
}

function collectionHref(kind: "providers" | "regions" | "lines", value: string) {
  return `/servers/${kind}/${encodeURIComponent(value)}`;
}

function OfferMobileCard({ offer }: { offer: Offer }) {
  return (
    <article className="space-y-4 rounded-lg border border-border/70 bg-background p-4 shadow-sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="min-w-0 flex-1 text-base font-semibold leading-6 text-foreground">
            {offer.title}
          </h2>
          <Badge variant="outline" className={getStatusClassName(offer.status)}>
            {offerStatusLabels[offer.status] ?? offer.status}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {offer.providerName ? (
            <Badge variant="secondary">
              <Link
                href={collectionHref("providers", offer.providerName)}
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
          {offer.promoCode ? (
            <Badge variant="outline">优惠码 {offer.promoCode}</Badge>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-md bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">价格</p>
          <p className="mt-1 font-semibold text-foreground">{formatPrice(offer)}</p>
        </div>
        <div className="rounded-md bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">地区 / 线路</p>
          <p className="mt-1 font-medium text-foreground">
            {offer.region ? (
              <Link
                href={collectionHref("regions", offer.region)}
                prefetch
                className="underline-offset-4 hover:text-primary hover:underline"
              >
                {offer.region}
              </Link>
            ) : (
              "地区待补充"
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {offer.lineType ? (
              <Link
                href={collectionHref("lines", offer.lineType)}
                prefetch
                className="underline-offset-4 hover:text-primary hover:underline"
              >
                {offer.lineType}
              </Link>
            ) : (
              "线路待补充"
            )}
          </p>
        </div>
      </div>

      <div className="rounded-md bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">配置</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {specsText(offer) || "配置待补充"}
        </p>
      </div>

      <div className="border-t border-border/70 pt-3">
        <OfferActions offer={offer} />
      </div>
    </article>
  );
}

export function ServerOfferTable({ offers }: { offers: Offer[] }) {
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
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          (!normalizedQuery || haystack.includes(normalizedQuery)) &&
          (provider === "all" || offer.providerName === provider) &&
          (status === "all" || offer.status === status) &&
          (region === "all" || offer.region === region) &&
          (lineType === "all" || offer.lineType === lineType) &&
          (promoFilter === "all" ||
            (promoFilter === "with" && Boolean(offer.promoCode)) ||
            (promoFilter === "without" && !offer.promoCode))
        );
      })
      .sort((left, right) => {
        if (sortKey === "price-desc") {
          return priceSortValue(right.priceAmount) - priceSortValue(left.priceAmount);
        }

        if (sortKey === "new-desc") {
          return right.id - left.id;
        }

        return priceSortValue(left.priceAmount) - priceSortValue(right.priceAmount);
      });
  }, [lineType, offers, promoFilter, provider, query, region, sortKey, status]);

  if (offers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
        <p className="text-sm font-medium text-foreground">暂无结构化套餐</p>
        <p className="mt-2 text-sm text-muted-foreground">
          可以先在后台从历史文章提取套餐，或手工补充数据。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/70 bg-background p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Filter className="size-4 text-accent" />
            筛选套餐
          </div>
          <span className="text-xs text-muted-foreground">
            显示 {filteredOffers.length} / {offers.length}
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_145px_145px_145px_145px_145px_145px]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索套餐、地区、线路、优惠码"
            className="min-h-11 md:col-span-2 xl:col-span-1"
          />
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="min-h-11">
            <SelectValue placeholder="商家" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部商家</SelectItem>
            {providers.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="min-h-11">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(offerStatusLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="min-h-11">
            <SelectValue placeholder="地区" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部地区</SelectItem>
            {regions.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={lineType} onValueChange={setLineType}>
          <SelectTrigger className="min-h-11">
            <SelectValue placeholder="线路" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部线路</SelectItem>
            {lineTypes.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={setSortKey}>
          <SelectTrigger className="min-h-11">
            <SelectValue placeholder="排序" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="price-asc">价格从低到高</SelectItem>
            <SelectItem value="price-desc">价格从高到低</SelectItem>
            <SelectItem value="new-desc">最新优先</SelectItem>
          </SelectContent>
        </Select>
        <Select value={promoFilter} onValueChange={setPromoFilter}>
          <SelectTrigger className="min-h-11">
            <SelectValue placeholder="优惠码" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部优惠</SelectItem>
            <SelectItem value="with">有优惠码</SelectItem>
            <SelectItem value="without">无优惠码</SelectItem>
          </SelectContent>
        </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          当前显示 {filteredOffers.length} / {offers.length} 个套餐
        </span>
        <span className="rounded-full bg-muted/40 px-3 py-1 text-xs">
          {sortKey === "price-asc"
            ? "价格从低到高"
            : sortKey === "price-desc"
              ? "价格从高到低"
              : "最新优先"}
        </span>
      </div>
      {filteredOffers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">没有匹配的套餐</p>
          <p className="mt-2 text-sm text-muted-foreground">
            试试减少筛选条件，或改用地区、线路、商家关键词搜索。
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 md:hidden">
        {filteredOffers.map((offer) => (
          <OfferMobileCard key={offer.id} offer={offer} />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm md:block">
        <table className="w-full table-fixed text-[13px]">
          <thead className="border-b border-border/70 bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-[25%] px-3 py-3 font-medium">套餐</th>
              <th className="w-[15%] px-3 py-3 font-medium">价格</th>
              <th className="w-[14%] px-3 py-3 font-medium">地区/线路</th>
              <th className="w-[24%] px-3 py-3 font-medium">配置</th>
              <th className="w-[9%] px-3 py-3 font-medium">状态</th>
              <th className="w-[13%] px-3 py-3 text-right font-medium">入口</th>
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
                            href={collectionHref("providers", offer.providerName)}
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
                  <p className="font-semibold leading-5 text-foreground">
                    {formatPrice(offer)}
                  </p>
                  {offer.promoCode ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      优惠码：{offer.promoCode}
                    </p>
                  ) : null}
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
                      "地区待补充"
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
                      "线路待补充"
                    )}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p className="line-clamp-3 leading-5 text-muted-foreground">
                    {specsText(offer) || "配置待补充"}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <Badge variant="outline" className={getStatusClassName(offer.status)}>
                    {offerStatusLabels[offer.status] ?? offer.status}
                  </Badge>
                </td>
                <td className="px-3 py-3">
                  <OfferActions offer={offer} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
