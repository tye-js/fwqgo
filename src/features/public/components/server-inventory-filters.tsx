"use client";

import { useMemo, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { Filter, RotateCcw, Search, Store } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  PublicInventoryFacets,
  PublicInventoryFilters,
} from "@/server/offers/public-inventory-query";

type FilterKey =
  | "kind"
  | "provider"
  | "group"
  | "stock"
  | "check"
  | "region"
  | "line"
  | "feature"
  | "promo"
  | "sort";

function getFormDataText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function isDefaultValue(key: FilterKey, value: string) {
  if (key === "kind") return value === "regular";
  if (key === "stock") return value === "in_stock";
  if (key === "sort") return value === "price-asc";
  return value === "all";
}

function useInventoryNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function navigate(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cursor");

    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }

    const href = params.size ? `${pathname}?${params.toString()}` : pathname;
    startTransition(() => router.replace(href, { scroll: false }));
  }

  function updateFilter(key: FilterKey, value: string) {
    navigate({ [key]: isDefaultValue(key, value) ? null : value });
  }

  function resetFilters() {
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  return { isPending, navigate, resetFilters, updateFilter };
}

export function ServerInventoryProviderNav({
  facets,
  filters,
}: {
  facets: PublicInventoryFacets;
  filters: PublicInventoryFilters;
}) {
  const [providerSearch, setProviderSearch] = useState("");
  const { isPending, updateFilter } = useInventoryNavigation();
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
          className="h-9"
        />
      </div>
      <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto p-2">
        <button
          type="button"
          onClick={() => updateFilter("provider", "all")}
          disabled={isPending}
          aria-pressed={filters.provider === "all"}
          className={`flex min-h-10 w-full items-center justify-between rounded-md px-3 text-left text-sm transition-colors disabled:opacity-50 ${
            filters.provider === "all"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          }`}
        >
          <span>全部厂商</span>
          <span className="text-xs tabular-nums opacity-75">{total}</span>
        </button>
        {visibleProviders.map((provider) => (
          <button
            key={provider.key}
            type="button"
            onClick={() => updateFilter("provider", provider.key)}
            disabled={isPending}
            aria-pressed={filters.provider === provider.key}
            className={`mt-1 flex min-h-10 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-sm transition-colors disabled:opacity-50 ${
              filters.provider === provider.key
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            <span className="min-w-0 truncate">{provider.label}</span>
            <span className="shrink-0 text-xs tabular-nums opacity-75">
              {provider.count}
            </span>
          </button>
        ))}
        {visibleProviders.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            没有匹配的厂商
          </p>
        ) : null}
      </div>
    </aside>
  );
}

function FacetSelect({
  value,
  placeholder,
  allLabel,
  items,
  onValueChange,
}: {
  value: string;
  placeholder: string;
  allLabel: string;
  items: Array<{ key: string; label: string; count: number }>;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="min-h-11 md:min-h-9">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {items.map((item) => (
          <SelectItem key={item.key} value={item.key}>
            {item.label} · {item.count}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ServerInventoryToolbar({
  facets,
  filters,
}: {
  facets: PublicInventoryFacets;
  filters: PublicInventoryFilters;
}) {
  const { isPending, navigate, resetFilters, updateFilter } =
    useInventoryNavigation();

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = getFormDataText(formData, "q").trim();
    navigate({ q: query ? query : null });
  }

  function submitPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const minPrice = getFormDataText(formData, "minPrice").trim();
    const maxPrice = getFormDataText(formData, "maxPrice").trim();
    navigate({
      minPrice: minPrice ? minPrice : null,
      maxPrice: maxPrice ? maxPrice : null,
    });
  }

  return (
    <div className="rounded-lg border border-border/70 bg-background p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Filter className="size-4 text-primary" />
          筛选套餐
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={resetFilters}
          disabled={isPending}
        >
          <RotateCcw className="size-4" />
          重置
        </Button>
      </div>

      <div
        className="mb-3 grid grid-cols-2 rounded-md border border-border/70 bg-muted/30 p-1"
        aria-label="套餐属性"
      >
        {([
          ["regular", "常规款"],
          ["promotion", "活动款"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filters.kind === value}
            disabled={isPending}
            onClick={() =>
              navigate({
                kind: value === "regular" ? null : value,
                check: null,
              })
            }
            className={`min-h-10 rounded-sm px-3 text-sm font-medium transition-colors disabled:opacity-50 ${
              filters.kind === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        onSubmit={submitSearch}
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <Input
          name="q"
          defaultValue={filters.query}
          placeholder="搜索名称、厂商、机房、线路或规格"
          aria-label="搜索服务器套餐"
          className="min-h-11"
        />
        <Button type="submit" className="min-h-11" disabled={isPending}>
          <Search className="size-4" />
          搜索
        </Button>
      </form>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="lg:hidden">
          <FacetSelect
            value={filters.provider}
            placeholder="厂商"
            allLabel="全部厂商"
            items={facets.providers}
            onValueChange={(value) => updateFilter("provider", value)}
          />
        </div>
        <Select
          value={filters.stock}
          onValueChange={(value) => updateFilter("stock", value)}
        >
          <SelectTrigger className="min-h-11 md:min-h-9">
            <SelectValue placeholder="库存状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部库存</SelectItem>
            <SelectItem value="in_stock">有货</SelectItem>
            <SelectItem value="out_of_stock">缺货</SelectItem>
            <SelectItem value="restocking">补货中</SelectItem>
            <SelectItem value="preorder">预售</SelectItem>
            <SelectItem value="discontinued">停售</SelectItem>
          </SelectContent>
        </Select>
        <FacetSelect
          value={filters.group}
          placeholder="产品组"
          allLabel="全部产品组"
          items={facets.groups}
          onValueChange={(value) => updateFilter("group", value)}
        />
        <Select
          value={filters.sort}
          onValueChange={(value) => updateFilter("sort", value)}
        >
          <SelectTrigger className="min-h-11 md:min-h-9">
            <SelectValue placeholder="排序" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="price-asc">月价从低到高</SelectItem>
            <SelectItem value="price-desc">月价从高到低</SelectItem>
            <SelectItem value="latest">最近更新</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <details className="mt-2 rounded-md border border-border/60 bg-muted/15 px-3 py-2">
        <summary className="cursor-pointer select-none text-sm font-medium text-foreground">
          更多筛选
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <FacetSelect
            value={filters.region}
            placeholder="地区"
            allLabel="全部地区"
            items={facets.regions}
            onValueChange={(value) => updateFilter("region", value)}
          />
          <FacetSelect
            value={filters.line}
            placeholder="线路"
            allLabel="全部线路"
            items={facets.lines}
            onValueChange={(value) => updateFilter("line", value)}
          />
          <FacetSelect
            value={filters.feature}
            placeholder="特征"
            allLabel="全部特征"
            items={facets.features}
            onValueChange={(value) => updateFilter("feature", value)}
          />
          <Select
            value={filters.promo}
            onValueChange={(value) => updateFilter("promo", value)}
          >
            <SelectTrigger className="min-h-11 md:min-h-9">
              <SelectValue placeholder="优惠码" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部优惠码</SelectItem>
              <SelectItem value="with">有优惠码</SelectItem>
              <SelectItem value="without">无优惠码</SelectItem>
            </SelectContent>
          </Select>
          {filters.kind === "promotion" ? (
            <Select
              value={filters.check}
              onValueChange={(value) => updateFilter("check", value)}
            >
              <SelectTrigger className="min-h-11 md:min-h-9">
                <SelectValue placeholder="探测状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部探测状态</SelectItem>
                <SelectItem value="ok">探测正常</SelectItem>
                <SelectItem value="failed">探测失败</SelectItem>
                <SelectItem value="unknown">尚未探测</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <form
          onSubmit={submitPrice}
          className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,160px)_minmax(0,160px)_auto]"
        >
          <Input
            name="minPrice"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            defaultValue={filters.minPrice}
            placeholder="最低月价 USD"
            aria-label="最低美元月价"
            className="min-h-11 md:min-h-9"
          />
          <Input
            name="maxPrice"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            defaultValue={filters.maxPrice}
            placeholder="最高月价 USD"
            aria-label="最高美元月价"
            className="min-h-11 md:min-h-9"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="min-h-11 md:min-h-9"
            disabled={isPending}
          >
            应用价格
          </Button>
        </form>
      </details>
    </div>
  );
}
