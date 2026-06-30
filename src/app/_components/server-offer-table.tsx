"use client";

import Link from "next/link";
import { ArrowUpRight, FileText, FlaskConical, ShoppingCart } from "lucide-react";
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

function formatPrice(offer: Offer) {
  if (!offer.priceAmount) return "待补充";
  const currency = offer.currency === "CNY" ? "¥" : "$";
  const cycle = offer.billingCycle
    ? billingCycleLabels[offer.billingCycle] ?? offer.billingCycle
    : "周期待确认";
  return `${currency}${Number(offer.priceAmount).toFixed(2)} / ${cycle}`;
}

function specsText(offer: Offer) {
  return [offer.cpu, offer.memory, offer.storage, offer.bandwidth, offer.traffic]
    .filter(Boolean)
    .join(" · ");
}

function getUniqueValues(values: Array<string | null>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
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
          return Number(right.priceAmount ?? Infinity) - Number(left.priceAmount ?? Infinity);
        }

        if (sortKey === "new-desc") {
          return right.id - left.id;
        }

        return Number(left.priceAmount ?? Infinity) - Number(right.priceAmount ?? Infinity);
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
      <div className="grid gap-3 rounded-lg border border-border/70 bg-background p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_145px_145px_145px_145px_145px_145px]">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索套餐、地区、线路、优惠码"
          className="min-h-11"
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
      <div className="text-sm text-muted-foreground">
        当前显示 {filteredOffers.length} / {offers.length} 个套餐
      </div>
      <div className="overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-border/70 bg-muted/30 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">套餐</th>
              <th className="px-4 py-3 font-medium">价格</th>
              <th className="px-4 py-3 font-medium">地区/线路</th>
              <th className="px-4 py-3 font-medium">配置</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 text-right font-medium">入口</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {filteredOffers.map((offer) => (
              <tr key={offer.id} className="align-top hover:bg-muted/20">
                <td className="px-4 py-4">
                  <div className="max-w-[260px] space-y-2">
                    <p className="font-medium leading-6 text-foreground">
                      {offer.title}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {offer.providerName ? (
                        <Badge variant="secondary">{offer.providerName}</Badge>
                      ) : null}
                      {offer.productType ? (
                        <Badge variant="outline">{offer.productType}</Badge>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <p className="font-semibold text-foreground">
                    {formatPrice(offer)}
                  </p>
                  {offer.promoCode ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      优惠码：{offer.promoCode}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-4">
                  <p className="font-medium">{offer.region ?? "地区待补充"}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {offer.lineType ?? "线路待补充"}
                  </p>
                </td>
                <td className="px-4 py-4">
                  <p className="max-w-[320px] leading-6 text-muted-foreground">
                    {specsText(offer) || "配置待补充"}
                  </p>
                </td>
                <td className="px-4 py-4">
                  <Badge>
                    {offerStatusLabels[offer.status] ?? offer.status}
                  </Badge>
                </td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    {offer.purchaseUrl ? (
                      <Button asChild size="sm">
                        <a href={offer.purchaseUrl} target="_blank" rel="nofollow noreferrer">
                          <ShoppingCart className="size-4" />
                          购买
                        </a>
                      </Button>
                    ) : null}
                    {offer.articleUrl ? (
                      <Button asChild size="icon" variant="outline">
                        <Link href={offer.articleUrl} aria-label="推广文章">
                          <FileText className="size-4" />
                        </Link>
                      </Button>
                    ) : null}
                    {offer.reviewUrl ? (
                      <Button asChild size="icon" variant="outline">
                        <Link href={offer.reviewUrl} aria-label="测评文章">
                          <FlaskConical className="size-4" />
                        </Link>
                      </Button>
                    ) : null}
                    {!offer.purchaseUrl && !offer.articleUrl && !offer.reviewUrl ? (
                      <ArrowUpRight className="mt-2 size-4 text-muted-foreground" />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
