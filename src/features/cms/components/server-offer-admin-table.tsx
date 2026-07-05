"use client";

import Link from "next/link";
import { Fragment, type ReactNode, useMemo, useState, useTransition } from "react";
import { ExternalLink, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  bulkUpdateServerOffersAction,
  updateServerOfferAction,
} from "@/features/cms/actions/server-offers";
import {
  AdminTableEmpty,
  AdminTableWorkbench,
} from "@/features/cms/components/admin-table-workbench";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type getAdminServerOffers } from "@/server/offers/server-offers";
import { isInternalHref, isSafePublicHref } from "@fwqgo/core/utils";
import { useUrlQueryUpdater } from "@/features/cms/hooks/use-url-query-updater";

type Offer = Awaited<ReturnType<typeof getAdminServerOffers>>[number];
type ServerOfferTableFilters = {
  pageNo: number;
  query: string;
  status: string;
  reviewStatus: string;
  visibility: string;
};

const offerStatusLabels = {
  in_stock: "有货",
  out_of_stock: "没货",
  restocking: "补货",
  discontinued: "停售",
  preorder: "预售",
} as const;

const statusOptions = Object.entries(offerStatusLabels);

const offerReviewStatusLabels = {
  pending: "待审核",
  reviewed: "已审核",
  needs_fix: "需修正",
  duplicate: "重复",
  merged: "已合并",
} as const;

const reviewStatusOptions = Object.entries(offerReviewStatusLabels);

function formatPrice(offer: Offer) {
  if (
    offer.priceAmount === null ||
    offer.priceAmount === undefined ||
    offer.priceAmount === ""
  ) {
    return "待补充";
  }

  const amount = Number(offer.priceAmount);
  if (!Number.isFinite(amount)) {
    return "待确认";
  }

  return `${offer.currency === "CNY" ? "¥" : "$"}${amount.toFixed(2)}`;
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function SafeAdminOfferLink({
  href,
  children,
  iconOnly = false,
  rel = "noopener noreferrer",
  ariaLabel,
}: {
  href: string | null | undefined;
  children: ReactNode;
  iconOnly?: boolean;
  rel?: string;
  ariaLabel?: string;
}) {
  const safeHref = cleanText(href);
  if (!isSafePublicHref(safeHref)) return null;

  return (
    <Button asChild size={iconOnly ? "icon" : "sm"} variant="outline">
      {isInternalHref(safeHref) ? (
        <Link href={safeHref} aria-label={ariaLabel}>
          {children}
        </Link>
      ) : (
        <a
          href={safeHref}
          target="_blank"
          rel={rel}
          aria-label={ariaLabel}
        >
          {children}
        </a>
      )}
    </Button>
  );
}

function OfferEditForm({ offer, onDone }: { offer: Offer; onDone: () => void }) {
  const [visible, setVisible] = useState(offer.visible);
  const [featured, setFeatured] = useState(offer.featured);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    formData.set("visible", visible ? "true" : "false");
    formData.set("featured", featured ? "true" : "false");

    startTransition(async () => {
      const result = await updateServerOfferAction(offer.id, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("套餐已更新");
      onDone();
    });
  }

  return (
    <form action={handleSubmit} className="grid gap-4 rounded-lg border border-border/70 bg-muted/20 p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_140px_140px]">
        <div className="space-y-2">
          <Label>标题</Label>
          <Input name="title" defaultValue={offer.title} required />
        </div>
        <div className="space-y-2">
          <Label>商家</Label>
          <Input name="providerName" defaultValue={offer.providerName ?? ""} />
        </div>
        <div className="space-y-2">
          <Label>价格</Label>
          <Input name="priceAmount" defaultValue={offer.priceAmount ?? ""} />
        </div>
        <div className="space-y-2">
          <Label>币种</Label>
          <Select name="currency" defaultValue={offer.currency ?? "USD"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="CNY">CNY</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-2">
          <Label>周期</Label>
          <Select name="billingCycle" defaultValue={offer.billingCycle ?? "monthly"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">月付</SelectItem>
              <SelectItem value="quarterly">季付</SelectItem>
              <SelectItem value="semiannual">半年</SelectItem>
              <SelectItem value="yearly">年付</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>地区</Label>
          <Input name="region" defaultValue={offer.region ?? ""} />
        </div>
        <div className="space-y-2">
          <Label>线路</Label>
          <Input name="lineType" defaultValue={offer.lineType ?? ""} />
        </div>
        <div className="space-y-2">
          <Label>状态</Label>
          <Select name="status" defaultValue={offer.status}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>审核</Label>
          <Select name="reviewStatus" defaultValue={offer.reviewStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {reviewStatusOptions.map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-2">
          <Label>优惠码</Label>
          <Input name="promoCode" defaultValue={offer.promoCode ?? ""} />
        </div>
        <div className="space-y-2">
          <Label>重复 Key</Label>
          <Input value={offer.duplicateKey ?? ""} readOnly />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2">
          <Label>购买链接</Label>
          <Input name="purchaseUrl" defaultValue={offer.purchaseUrl ?? ""} />
        </div>
        <div className="space-y-2">
          <Label>推广文章</Label>
          <Input name="articleUrl" defaultValue={offer.articleUrl ?? ""} />
        </div>
        <div className="space-y-2">
          <Label>测评文章</Label>
          <Input name="reviewUrl" defaultValue={offer.reviewUrl ?? ""} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-5">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={visible} onCheckedChange={setVisible} />
            前台展示
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={featured} onCheckedChange={setFeatured} />
            推荐
          </label>
        </div>
        <Button type="submit" disabled={isPending}>
          <Save className="size-4" />
          {isPending ? "保存中..." : "保存套餐"}
        </Button>
      </div>
    </form>
  );
}

function normalizeFilterValue(
  value: string,
  allowedValues: string[],
  fallback = "all",
) {
  return allowedValues.includes(value) ? value : fallback;
}

export function ServerOfferAdminTable({
  offers,
  initialFilters,
}: {
  offers: Offer[];
  initialFilters: ServerOfferTableFilters;
}) {
  const router = useRouter();
  const updateUrlQuery = useUrlQueryUpdater();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [bulkStatus, setBulkStatus] = useState("in_stock");
  const [bulkReviewStatus, setBulkReviewStatus] = useState("reviewed");
  const [isPending, startTransition] = useTransition();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const activeFilters = {
    pageNo: initialFilters.pageNo,
    query: initialFilters.query,
    status: normalizeFilterValue(
      initialFilters.status,
      statusOptions.map(([value]) => value),
    ),
    reviewStatus: normalizeFilterValue(
      initialFilters.reviewStatus,
      reviewStatusOptions.map(([value]) => value),
    ),
    visibility: normalizeFilterValue(initialFilters.visibility, [
      "all",
      "visible",
      "hidden",
      "featured",
    ]),
  };
  const filteredOffers = useMemo(() => {
    const normalizedQuery = activeFilters.query.trim().toLowerCase();

    return offers.filter((offer) => {
      const matchesQuery =
        !normalizedQuery ||
        offer.title.toLowerCase().includes(normalizedQuery) ||
        (offer.providerName?.toLowerCase().includes(normalizedQuery) ??
          false) ||
        (offer.region?.toLowerCase().includes(normalizedQuery) ?? false) ||
        (offer.lineType?.toLowerCase().includes(normalizedQuery) ?? false) ||
        (offer.promoCode?.toLowerCase().includes(normalizedQuery) ?? false);
      const matchesStatus =
        activeFilters.status === "all" || offer.status === activeFilters.status;
      const matchesReviewStatus =
        activeFilters.reviewStatus === "all" ||
        offer.reviewStatus === activeFilters.reviewStatus;
      const matchesVisibility =
        activeFilters.visibility === "all" ||
        (activeFilters.visibility === "visible" && offer.visible) ||
        (activeFilters.visibility === "hidden" && !offer.visible) ||
        (activeFilters.visibility === "featured" && offer.featured);

      return (
        matchesQuery &&
        matchesStatus &&
        matchesReviewStatus &&
        matchesVisibility
      );
    });
  }, [
    activeFilters.query,
    activeFilters.reviewStatus,
    activeFilters.status,
    activeFilters.visibility,
    offers,
  ]);
  const pageSize = 20;
  const totalPage = Math.max(1, Math.ceil(filteredOffers.length / pageSize));
  const currentPage = Math.min(Math.max(activeFilters.pageNo, 1), totalPage);
  const pagedOffers = filteredOffers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const hasSelectedOffers = selectedIds.length > 0;

  function toggleSelected(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function runBulk(input: {
    status?: string;
    visible?: boolean;
    featured?: boolean;
    reviewStatus?: string;
  }) {
    if (selectedIds.length === 0) {
      toast.error("请先选择套餐");
      return;
    }

    startTransition(async () => {
      const result = await bulkUpdateServerOffersAction({
        ids: selectedIds,
        ...input,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`已更新 ${result.data?.updated ?? 0} 条套餐`);
      setSelectedIds([]);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <AdminTableWorkbench
        title="套餐筛选"
        description={`筛选条件和页码会写入地址栏，当前匹配 ${filteredOffers.length} 条套餐。`}
        searchValue={activeFilters.query}
        onSearchChange={(value) => updateUrlQuery({ query: value || null })}
        searchPlaceholder="搜索套餐、商家、地区、线路或优惠码"
        filterSlot={
          <>
            <Select
              value={activeFilters.status}
              onValueChange={(value) =>
                updateUrlQuery({ status: value === "all" ? null : value })
              }
            >
              <SelectTrigger className="min-h-11 w-full border-border/70 bg-background shadow-none focus:ring-0 sm:w-[120px] sm:border-0 sm:bg-transparent sm:px-0">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {statusOptions.map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={activeFilters.reviewStatus}
              onValueChange={(value) =>
                updateUrlQuery({
                  reviewStatus: value === "all" ? null : value,
                })
              }
            >
              <SelectTrigger className="min-h-11 w-full border-border/70 bg-background shadow-none focus:ring-0 sm:w-[120px] sm:border-0 sm:bg-transparent sm:px-0">
                <SelectValue placeholder="审核" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部审核</SelectItem>
                {reviewStatusOptions.map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={activeFilters.visibility}
              onValueChange={(value) =>
                updateUrlQuery({ visibility: value === "all" ? null : value })
              }
            >
              <SelectTrigger className="min-h-11 w-full border-border/70 bg-background shadow-none focus:ring-0 sm:w-[120px] sm:border-0 sm:bg-transparent sm:px-0">
                <SelectValue placeholder="展示" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部展示</SelectItem>
                <SelectItem value="visible">前台展示</SelectItem>
                <SelectItem value="hidden">已隐藏</SelectItem>
                <SelectItem value="featured">推荐</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-background p-3 shadow-sm">
        <div className="text-sm text-muted-foreground">
          已选择 {selectedIds.length} / {filteredOffers.length} 条
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={bulkStatus} onValueChange={setBulkStatus}>
            <SelectTrigger className="min-h-11 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || !hasSelectedOffers}
            title={hasSelectedOffers ? "批量修改所选套餐状态" : "请先选择套餐"}
            onClick={() => runBulk({ status: bulkStatus })}
          >
            批量改状态
          </Button>
          <Select value={bulkReviewStatus} onValueChange={setBulkReviewStatus}>
            <SelectTrigger className="min-h-11 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {reviewStatusOptions.map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || !hasSelectedOffers}
            title={hasSelectedOffers ? "批量修改所选套餐审核状态" : "请先选择套餐"}
            onClick={() => runBulk({ reviewStatus: bulkReviewStatus })}
          >
            批量审核
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || !hasSelectedOffers}
            title={hasSelectedOffers ? "批量隐藏所选套餐" : "请先选择套餐"}
            onClick={() => runBulk({ visible: false })}
          >
            批量隐藏
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || !hasSelectedOffers}
            title={hasSelectedOffers ? "批量显示所选套餐" : "请先选择套餐"}
            onClick={() => runBulk({ visible: true })}
          >
            批量显示
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/70 bg-background shadow-sm">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>套餐</TableHead>
              <TableHead>价格</TableHead>
              <TableHead>地区/线路</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>审核</TableHead>
              <TableHead>入口</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedOffers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <AdminTableEmpty
                    title="没有匹配的套餐"
                    description="当前筛选条件下没有可展示套餐。可以清空搜索词，或切换状态、审核、展示筛选。"
                  />
                </TableCell>
              </TableRow>
            ) : null}
            {pagedOffers.map((offer) => (
              <Fragment key={offer.id}>
                <TableRow>
                  <TableCell>
                    <Checkbox
                      checked={selectedSet.has(offer.id)}
                      onCheckedChange={() => toggleSelected(offer.id)}
                      aria-label={`选择 ${offer.title}`}
                    />
                  </TableCell>
                  <TableCell className="min-w-[260px]">
                    <div className="space-y-2">
                      <p className="line-clamp-2 font-medium">{offer.title}</p>
                      <div className="flex flex-wrap gap-2">
                        {offer.providerName ? (
                          <Badge variant="secondary">{offer.providerName}</Badge>
                        ) : null}
                        {offer.featured ? <Badge>推荐</Badge> : null}
                        {!offer.visible ? <Badge variant="outline">隐藏</Badge> : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{formatPrice(offer)}</p>
                    {offer.promoCode ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {offer.promoCode}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <p>{offer.region ?? "-"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {offer.lineType ?? "-"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={offer.status === "in_stock" ? "default" : "secondary"}>
                      {offerStatusLabels[offer.status as keyof typeof offerStatusLabels] ?? offer.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge
                        variant={
                          offer.reviewStatus === "reviewed"
                            ? "default"
                            : offer.reviewStatus === "needs_fix"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {offerReviewStatusLabels[
                          offer.reviewStatus as keyof typeof offerReviewStatusLabels
                        ] ?? offer.reviewStatus}
                      </Badge>
                      {offer.mergedIntoOfferId ? (
                        <p className="text-xs text-muted-foreground">
                          合并到 #{offer.mergedIntoOfferId}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <SafeAdminOfferLink
                        href={offer.purchaseUrl}
                        iconOnly
                        rel="nofollow sponsored noopener noreferrer"
                        ariaLabel="打开购买入口"
                      >
                        <ExternalLink className="size-4" />
                      </SafeAdminOfferLink>
                      <SafeAdminOfferLink href={offer.articleUrl}>
                        文章
                      </SafeAdminOfferLink>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setEditId((value) => (value === offer.id ? null : offer.id))
                      }
                    >
                      编辑
                    </Button>
                  </TableCell>
                </TableRow>
                {editId === offer.id ? (
                  <TableRow>
                    <TableCell colSpan={8} className="bg-muted/20">
                      <OfferEditForm
                        offer={offer}
                        onDone={() => {
                          setEditId(null);
                          router.refresh();
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
      <PaginationComponent pageNo={currentPage} totalPage={totalPage} />
    </div>
  );
}
