import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  PackageSearch,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServerInventoryOfferActions } from "@/features/public/components/server-inventory-offer-actions";
import { buildPublicInventoryHref } from "@fwqgo/core/public-inventory-filters";
import { DISPLAY_TIME_ZONE } from "@fwqgo/core/display-time-zone";
import type {
  PublicInventoryFilters,
  PublicInventoryPage,
} from "@/server/offers/public-inventory-query";

const stockLabels: Record<string, string> = {
  in_stock: "有货",
  out_of_stock: "缺货",
  restocking: "补货中",
  discontinued: "停售",
  preorder: "预售",
};

const stockClasses: Record<string, string> = {
  in_stock:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  out_of_stock: "border-border bg-muted text-muted-foreground",
  restocking:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  discontinued: "border-border bg-muted text-muted-foreground",
  preorder: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function specText(offer: PublicInventoryPage["items"][number]) {
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

function formatCheckedAt(value: Date | null) {
  if (!value) return "尚未探测";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: DISPLAY_TIME_ZONE,
  }).format(value);
}

function collectionHref(
  kind: "providers" | "regions" | "lines",
  value: string,
) {
  return `/servers/${kind}/${encodeURIComponent(value)}`;
}

/**
 * A collection page exists only for a canonical entity slug. The offer rows
 * carry the upstream marketing text ("United States", "CMIN2 / CU9929", a
 * provider name), and an offer whose entity is not mapped has no page behind
 * that text. Linking it anyway produced a crawlable 404 for most offers, so an
 * unmapped label renders as plain text here — the same rule the site already
 * applies to taxonomy links that fall below the threshold.
 */
function CollectionLink({
  kind,
  slug,
  className,
  children,
}: {
  kind: "providers" | "regions" | "lines";
  slug: string | null | undefined;
  className?: string;
  children: ReactNode;
}) {
  const canonical = slug?.trim();
  if (!canonical) return <span className={className}>{children}</span>;
  return (
    <Link href={collectionHref(kind, canonical)} className={className}>
      {children}
    </Link>
  );
}

function buildPageHref(filters: PublicInventoryFilters, cursor: string) {
  return `${buildPublicInventoryHref({ ...filters, cursor })}#inventory-results`;
}

function StatusCell({
  status,
  offerKind,
  checkStatus,
  isStale,
}: {
  status: string;
  offerKind: string;
  checkStatus: string;
  isStale: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Badge
        variant="outline"
        className={stockClasses[status] ?? stockClasses.out_of_stock}
      >
        {status === "in_stock" ? (
          <CheckCircle2 className="mr-1 size-3.5" />
        ) : null}
        {stockLabels[status] ?? status}
      </Badge>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {offerKind === "regular" ? (
          <Clock3 className="size-3.5" />
        ) : checkStatus === "failed" ? (
          <AlertTriangle className="size-3.5 text-amber-600" />
        ) : (
          <Clock3 className="size-3.5" />
        )}
        {offerKind === "regular"
          ? "人工维护"
          : checkStatus === "ok"
            ? isStale
              ? "数据超过 24 小时"
              : "探测正常"
            : checkStatus === "failed"
              ? "探测失败"
              : "待探测"}
      </p>
    </div>
  );
}

function OfferMobileCard({
  offer,
}: {
  offer: PublicInventoryPage["items"][number];
}) {
  const specs = specText(offer);
  const productGroup =
    cleanText(offer.productGroup) ?? cleanText(offer.productType) ?? "未分组";

  return (
    <article className="min-w-0 rounded-lg border border-border/70 bg-background p-4 shadow-sm">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
        <div className="min-w-0 max-w-full">
          <p className="break-words text-sm font-semibold leading-6 text-foreground">
            {offer.title}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            {offer.providerName ? (
              <CollectionLink
                kind="providers"
                slug={offer.providerSlug}
                className="min-h-11 max-w-full break-words py-3 text-primary underline-offset-4 hover:underline"
              >
                {offer.providerName}
              </CollectionLink>
            ) : null}
            {offer.externalProductId ? (
              <span className="max-w-full break-all">
                PID {offer.externalProductId}
              </span>
            ) : null}
          </div>
        </div>
        <StatusCell
          status={offer.status}
          offerKind={offer.offerKind}
          checkStatus={offer.checkStatus}
          isStale={offer.isStale}
        />
      </div>

      <dl className="mt-3 grid min-w-0 grid-cols-1 gap-2 rounded-md bg-muted/25 p-3 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted-foreground">地区 / 线路</dt>
          <dd className="mt-1 break-words font-medium text-foreground">
            {offer.region ? (
              <CollectionLink
                kind="regions"
                slug={offer.regionSlug}
                className="min-h-11 break-words underline-offset-4 hover:text-primary hover:underline"
              >
                {offer.region}
              </CollectionLink>
            ) : (
              "待补充"
            )}
            {offer.lineType ? (
              <CollectionLink
                kind="lines"
                slug={offer.lineSlug}
                className="ml-1 inline-flex min-h-11 items-center break-words underline-offset-4 hover:text-primary hover:underline"
              >
                {offer.lineType}
              </CollectionLink>
            ) : null}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">产品组</dt>
          <dd className="mt-1 break-words font-medium text-foreground">
            {productGroup}
          </dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-muted-foreground">配置</dt>
          <dd className="mt-1 break-words leading-5 text-foreground">
            {specs ? specs : "配置待补充"}
          </dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-muted-foreground">套餐标签</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {offer.tags.length > 0 ? (
              offer.tags.map((tag) => (
                <Badge key={tag.slug} variant="outline" className="break-words">
                  {tag.label}
                </Badge>
              ))
            ) : (
              <span className="text-foreground">暂无标签</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-col items-stretch gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 break-words text-xs text-muted-foreground">
          {offer.offerKind === "promotion"
            ? `上次探测：${formatCheckedAt(offer.lastCheckedAt)}`
            : `资料更新：${formatCheckedAt(offer.updatedAt ?? offer.createdAt)}`}
          {offer.validUntil ? (
            <span className="mt-1 block break-words">
              有效期至：{formatCheckedAt(offer.validUntil)}
            </span>
          ) : null}
        </div>
        <ServerInventoryOfferActions
          prices={offer.prices}
          fallbackPrice={offer.priceAmount}
          fallbackMonthlyPriceUsd={offer.monthlyPriceUsd}
          fallbackCurrency={offer.currency}
          fallbackCycle={offer.billingCycle}
          purchaseUrl={offer.purchaseUrl}
          promoCode={offer.promoCode}
          articleUrl={offer.articleUrl}
          reviewUrl={offer.reviewUrl}
        />
      </div>
    </article>
  );
}

export function ServerInventoryResults({
  page,
  filters,
}: {
  page: PublicInventoryPage;
  filters: PublicInventoryFilters;
}) {
  if (page.items.length === 0) {
    return (
      <div
        id="inventory-results"
        className="scroll-mt-24 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-14 text-center"
      >
        <PackageSearch className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">
          没有匹配的库存套餐
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          可以减少筛选条件、切换套餐属性，或查看缺货和预售产品。
        </p>
      </div>
    );
  }

  return (
    <div id="inventory-results" className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          本页 {page.items.length} 条，共匹配{" "}
          {page.total.toLocaleString("zh-CN")} 条
        </span>
        <span>价格统一折算为美元月价排序</span>
      </div>

      <div className="grid gap-3 xl:hidden">
        {page.items.map((offer) => (
          <OfferMobileCard key={offer.id} offer={offer} />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-border/70 bg-background shadow-sm xl:block">
        <table className="w-full min-w-[1120px] table-fixed text-[13px]">
          <thead className="sticky top-0 z-10 border-b border-border/70 bg-muted/95 text-left text-xs text-muted-foreground backdrop-blur">
            <tr>
              <th className="w-[25%] px-3 py-3 font-medium">产品</th>
              <th className="w-[16%] px-3 py-3 font-medium">规格</th>
              <th className="w-[12%] px-3 py-3 font-medium">机房 / 线路</th>
              <th className="w-[13%] px-3 py-3 font-medium">产品组</th>
              <th className="w-[9%] px-3 py-3 font-medium">状态</th>
              <th className="w-[14%] px-3 py-3 font-medium">价格 / 操作</th>
              <th className="w-[11%] px-3 py-3 font-medium">
                {filters.kind === "promotion" ? "上次探测" : "资料更新"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {page.items.map((offer) => {
              const specs = specText(offer);
              return (
                <tr key={offer.id} className="align-top hover:bg-muted/20">
                  <td className="px-3 py-3">
                    <p className="line-clamp-2 font-semibold leading-5 text-foreground">
                      {offer.title}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {offer.providerName ? (
                        <CollectionLink
                          kind="providers"
                          slug={offer.providerSlug}
                          className="text-xs text-primary underline-offset-4 hover:underline"
                        >
                          {offer.providerName}
                        </CollectionLink>
                      ) : null}
                      {offer.externalProductId ? (
                        <span className="text-xs text-muted-foreground">
                          PID {offer.externalProductId}
                        </span>
                      ) : null}
                      {offer.tags.slice(0, 4).map((tag) => (
                        <Badge
                          key={tag.slug}
                          variant="outline"
                          className="text-[11px]"
                        >
                          {tag.label}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 leading-5 text-muted-foreground">
                    {specs ? specs : "配置待补充"}
                  </td>
                  <td className="px-3 py-3 leading-5">
                    {offer.region ? (
                      <CollectionLink
                        kind="regions"
                        slug={offer.regionSlug}
                        className="font-medium underline-offset-4 hover:text-primary hover:underline"
                      >
                        {offer.region}
                      </CollectionLink>
                    ) : (
                      <span className="text-muted-foreground">待补充</span>
                    )}
                    {offer.lineType ? (
                      <CollectionLink
                        kind="lines"
                        slug={offer.lineSlug}
                        className="mt-1 block text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                      >
                        {offer.lineType}
                      </CollectionLink>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 leading-5 text-muted-foreground">
                    {cleanText(offer.productGroup) ??
                      cleanText(offer.productType) ??
                      "未分组"}
                  </td>
                  <td className="px-3 py-3">
                    <StatusCell
                      status={offer.status}
                      offerKind={offer.offerKind}
                      checkStatus={offer.checkStatus}
                      isStale={offer.isStale}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <ServerInventoryOfferActions
                      prices={offer.prices}
                      fallbackPrice={offer.priceAmount}
                      fallbackMonthlyPriceUsd={offer.monthlyPriceUsd}
                      fallbackCurrency={offer.currency}
                      fallbackCycle={offer.billingCycle}
                      purchaseUrl={offer.purchaseUrl}
                      promoCode={offer.promoCode}
                      articleUrl={offer.articleUrl}
                      reviewUrl={offer.reviewUrl}
                    />
                  </td>
                  <td className="px-3 py-3 text-xs leading-5 text-muted-foreground">
                    {formatCheckedAt(
                      offer.offerKind === "promotion"
                        ? offer.lastCheckedAt
                        : (offer.updatedAt ?? offer.createdAt),
                    )}
                    {offer.validUntil ? (
                      <span className="mt-1 block">
                        有效期至 {formatCheckedAt(offer.validUntil)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {page.hasMore && page.nextCursor ? (
        <div className="flex justify-center pt-2">
          <Button asChild variant="outline" size="lg">
            <a href={buildPageHref(filters, page.nextCursor)}>查看下一页</a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
