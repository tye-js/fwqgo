"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Filter, RotateCcw, Search, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildPublicInventoryHref,
  parsePublicInventoryFilters,
  type PublicInventoryFilters,
  type PublicInventorySearchParams,
} from "@fwqgo/core/public-inventory-filters";
import type { PublicInventoryFacets } from "@/server/offers/public-inventory-query";

const selectClassName =
  "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function submitSelect(event: ChangeEvent<HTMLSelectElement>) {
  event.currentTarget.form?.requestSubmit();
}

function submitFilters(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const params: PublicInventorySearchParams = {};
  for (const [key, value] of new FormData(event.currentTarget)) {
    if (typeof value === "string") params[key] = value;
  }

  // Submit a fresh document request so the controls and results always use the
  // same server-parsed filters. The GET form also works before hydration.
  window.location.assign(
    buildPublicInventoryHref(parsePublicInventoryFilters(params)),
  );
}

export function ServerInventoryProviderNav({
  facets,
  filters,
}: {
  facets: PublicInventoryFacets;
  filters: PublicInventoryFilters;
}) {
  const [providerSearch, setProviderSearch] = useState("");
  const visibleProviders = useMemo(() => {
    const needle = providerSearch.trim().toLowerCase();
    return facets.providers
      .filter((provider) =>
        needle ? provider.label.toLowerCase().includes(needle) : true,
      )
      .slice(0, 100);
  }, [facets.providers, providerSearch]);
  const total = facets.providers.reduce((sum, item) => sum + item.count, 0);

  return (
    <aside className="hidden min-h-0 self-start rounded-lg border border-border/70 bg-background lg:sticky lg:top-24 lg:block">
      <div className="border-b border-border/70 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Store className="size-4 text-primary" />
          {filters.kind === "promotion" ? "活动商家" : "常规套餐商家"}
        </div>
        <Input
          value={providerSearch}
          onChange={(event) => setProviderSearch(event.target.value)}
          placeholder="搜索厂商"
          aria-label="搜索库存厂商"
          className="min-h-11"
        />
      </div>
      <nav
        aria-label="按厂商筛选套餐"
        className="max-h-[calc(100dvh-12rem)] overflow-y-auto p-2"
      >
        <a
          href={buildPublicInventoryHref({
            ...filters,
            provider: "all",
            cursor: "",
          })}
          aria-current={filters.provider === "all" ? "true" : undefined}
          className={`flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm transition-colors ${
            filters.provider === "all"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          }`}
        >
          <span>全部厂商</span>
          <span className="text-xs tabular-nums opacity-75">{total}</span>
        </a>
        {visibleProviders.map((provider) => (
          <a
            key={provider.key}
            href={buildPublicInventoryHref({
              ...filters,
              provider: provider.key,
              cursor: "",
            })}
            aria-current={
              filters.provider === provider.key ? "true" : undefined
            }
            className={`mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-sm transition-colors ${
              filters.provider === provider.key
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            <span className="min-w-0 break-words">{provider.label}</span>
            <span className="shrink-0 text-xs tabular-nums opacity-75">
              {provider.count}
            </span>
          </a>
        ))}
        {visibleProviders.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            没有匹配的厂商
          </p>
        ) : null}
      </nav>
    </aside>
  );
}

function FacetSelect({
  name,
  value,
  label,
  allLabel,
  items,
}: {
  name: "provider" | "group" | "region" | "line" | "feature";
  value: string;
  label: string;
  allLabel: string;
  items: Array<{ key: string; label: string; count: number }>;
}) {
  return (
    <select
      key={value}
      name={name}
      defaultValue={value}
      aria-label={label}
      onChange={submitSelect}
      className={selectClassName}
    >
      <option value="all">{allLabel}</option>
      {value !== "all" && !items.some((item) => item.key === value) ? (
        <option value={value}>{value}</option>
      ) : null}
      {items.map((item) => (
        <option key={item.key} value={item.key}>
          {item.label} · {item.count}
        </option>
      ))}
    </select>
  );
}

export function ServerInventoryToolbar({
  facets,
  filters,
}: {
  facets: PublicInventoryFacets;
  filters: PublicInventoryFilters;
}) {
  const hasAdvancedFilters =
    filters.region !== "all" ||
    filters.line !== "all" ||
    filters.feature !== "all" ||
    filters.promo !== "all" ||
    (filters.kind === "promotion" && filters.check !== "all") ||
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined;

  return (
    <form
      action="/servers"
      method="get"
      onSubmit={submitFilters}
      aria-label="筛选服务器套餐"
      className="rounded-lg border border-border/70 bg-background p-3 shadow-sm"
    >
      <input type="hidden" name="kind" value={filters.kind} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Filter className="size-4 text-primary" />
          筛选套餐
        </div>
        <Button asChild size="sm" variant="ghost" className="min-h-11">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Reset uses a fresh document request, like the filter form. */}
          <a href="/servers">
            <RotateCcw className="size-4" />
            重置
          </a>
        </Button>
      </div>

      <nav
        className="mb-3 grid grid-cols-2 rounded-md border border-border/70 bg-muted/30 p-1"
        aria-label="套餐属性"
      >
        {(
          [
            ["regular", "常规款"],
            ["promotion", "活动款"],
          ] as const
        ).map(([value, label]) => (
          <a
            key={value}
            aria-current={filters.kind === value ? "true" : undefined}
            href={buildPublicInventoryHref({
              ...filters,
              kind: value,
              check: "all",
              cursor: "",
            })}
            className={`flex min-h-11 items-center justify-center rounded-sm px-3 text-sm font-medium transition-colors ${
              filters.kind === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          key={filters.query}
          name="q"
          defaultValue={filters.query}
          maxLength={80}
          placeholder="搜索名称、厂商、机房、线路或规格"
          aria-label="搜索服务器套餐"
          className="min-h-11"
        />
        <Button type="submit" className="min-h-11">
          <Search className="size-4" />
          搜索
        </Button>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="lg:hidden">
          <FacetSelect
            name="provider"
            value={filters.provider}
            label="厂商"
            allLabel="全部厂商"
            items={facets.providers}
          />
        </div>
        <select
          name="stock"
          key={filters.stock}
          defaultValue={filters.stock}
          aria-label="库存状态"
          onChange={submitSelect}
          className={selectClassName}
        >
          <option value="all">全部库存</option>
          <option value="in_stock">有货</option>
          <option value="out_of_stock">缺货</option>
          <option value="restocking">补货中</option>
          <option value="preorder">预售</option>
          <option value="discontinued">停售</option>
        </select>
        <FacetSelect
          name="group"
          value={filters.group}
          label="产品组"
          allLabel="全部产品组"
          items={facets.groups}
        />
        <select
          name="sort"
          key={filters.sort}
          defaultValue={filters.sort}
          aria-label="排序"
          onChange={submitSelect}
          className={selectClassName}
        >
          <option value="price-asc">月价从低到高</option>
          <option value="price-desc">月价从高到低</option>
          <option value="latest">最近更新</option>
        </select>
      </div>

      <details
        open={hasAdvancedFilters}
        className="mt-2 rounded-md border border-border/60 bg-muted/15 px-3 py-2"
      >
        <summary className="flex min-h-11 cursor-pointer select-none items-center text-sm font-medium text-foreground">
          更多筛选
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <FacetSelect
            name="region"
            value={filters.region}
            label="地区"
            allLabel="全部地区"
            items={facets.regions}
          />
          <FacetSelect
            name="line"
            value={filters.line}
            label="线路"
            allLabel="全部线路"
            items={facets.lines}
          />
          <FacetSelect
            name="feature"
            value={filters.feature}
            label="特征"
            allLabel="全部特征"
            items={facets.features}
          />
          <select
            name="promo"
            key={filters.promo}
            defaultValue={filters.promo}
            aria-label="优惠码"
            onChange={submitSelect}
            className={selectClassName}
          >
            <option value="all">全部优惠码</option>
            <option value="with">有优惠码</option>
            <option value="without">无优惠码</option>
          </select>
          {filters.kind === "promotion" ? (
            <select
              name="check"
              key={filters.check}
              defaultValue={filters.check}
              aria-label="探测状态"
              onChange={submitSelect}
              className={selectClassName}
            >
              <option value="all">全部探测状态</option>
              <option value="ok">探测正常</option>
              <option value="failed">探测失败</option>
              <option value="unknown">尚未探测</option>
            </select>
          ) : null}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,160px)_minmax(0,160px)_auto]">
          <Input
            key={`min-${filters.minPrice ?? ""}`}
            name="minPrice"
            type="number"
            inputMode="decimal"
            min="0"
            max="1000000"
            step="0.01"
            defaultValue={filters.minPrice}
            placeholder="最低月价 USD"
            aria-label="最低美元月价"
            className="min-h-11"
          />
          <Input
            key={`max-${filters.maxPrice ?? ""}`}
            name="maxPrice"
            type="number"
            inputMode="decimal"
            min="0"
            max="1000000"
            step="0.01"
            defaultValue={filters.maxPrice}
            placeholder="最高月价 USD"
            aria-label="最高美元月价"
            className="min-h-11"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="min-h-11"
          >
            应用价格
          </Button>
        </div>
      </details>
    </form>
  );
}
