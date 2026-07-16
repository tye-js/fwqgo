"use client";

import Link from "next/link";
import {
  Fragment,
  type ReactNode,
  useMemo,
  useState,
  useTransition,
} from "react";
import { Activity, ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  bulkUpdateServerOffersAction,
  deleteServerOfferArticleRelationAction,
  saveServerOfferArticleRelationAction,
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
import type {
  getAdminServerOffers,
  getServerOfferRelationPostOptions,
} from "@/server/offers/server-offers";
import { type getProviderOptionsForMonitoring } from "@/server/offers/provider-monitor";
import { isInternalHref, isSafePublicHref } from "@fwqgo/core/utils";
import { useUrlQueryUpdater } from "@/features/cms/hooks/use-url-query-updater";

type Offer = Awaited<ReturnType<typeof getAdminServerOffers>>["rows"][number];
type Provider = Awaited<
  ReturnType<typeof getProviderOptionsForMonitoring>
>[number];
type RelationPost = Awaited<
  ReturnType<typeof getServerOfferRelationPostOptions>
>[number];
type EditablePrice = {
  key: string;
  billingCycle: string;
  amount: string;
  originalAmount: string;
  currency: string;
  purchaseUrl: string;
  active: boolean;
  validUntil: string;
};
type ServerOfferTableFilters = {
  pageNo: number;
  query: string;
  kind: string;
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

const offerKindLabels = {
  regular: "常规款",
  promotion: "活动款",
} as const;

const offerKindOptions = Object.entries(offerKindLabels);

const offerReviewStatusLabels = {
  pending: "待审核",
  reviewed: "已审核",
  needs_fix: "需修正",
  duplicate: "重复",
  merged: "已合并",
} as const;

const reviewStatusOptions = Object.entries(offerReviewStatusLabels);

const articleRelationLabels = {
  review: "测评",
  mention: "提及",
  deal: "优惠",
} as const;

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

function toDateTimeLocal(value: Date | null | undefined) {
  if (!value) return "";
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function initialEditablePrices(offer: Offer): EditablePrice[] {
  if (offer.prices.length > 0) {
    return offer.prices.map((price) => ({
      key: String(price.id),
      billingCycle: price.billingCycle,
      amount: price.amount,
      originalAmount: price.originalAmount ?? "",
      currency: price.currency,
      purchaseUrl: price.purchaseUrl ?? "",
      active: price.active,
      validUntil: toDateTimeLocal(price.validUntil),
    }));
  }
  if (offer.priceAmount) {
    return [
      {
        key: "legacy",
        billingCycle: offer.billingCycle ?? "monthly",
        amount: offer.priceAmount,
        originalAmount: "",
        currency: offer.currency ?? "USD",
        purchaseUrl: offer.purchaseUrl ?? "",
        active: true,
        validUntil: toDateTimeLocal(offer.validUntil),
      },
    ];
  }
  return [];
}

function PriceRowsEditor({
  prices,
  onChange,
}: {
  prices: EditablePrice[];
  onChange: (prices: EditablePrice[]) => void;
}) {
  function updatePrice(key: string, patch: Partial<EditablePrice>) {
    onChange(
      prices.map((price) =>
        price.key === key ? { ...price, ...patch } : price,
      ),
    );
  }

  function addPrice() {
    onChange([
      ...prices,
      {
        key: `new-${Date.now()}-${prices.length}`,
        billingCycle: "monthly",
        amount: "",
        originalAmount: "",
        currency: "USD",
        purchaseUrl: "",
        active: true,
        validUntil: "",
      },
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">多周期价格</p>
          <p className="text-xs text-muted-foreground">
            系统使用启用价格中最低的美元月价参与前台排序。
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addPrice}>
          <Plus className="size-4" />
          添加价格
        </Button>
      </div>
      {prices.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
          暂无价格，套餐仍可保存，但不会参与按价格筛选。
        </div>
      ) : null}
      {prices.map((price, index) => (
        <div
          key={price.key}
          className="grid gap-3 border-t border-border/60 pt-3 first:border-t-0 first:pt-0 lg:grid-cols-[140px_120px_100px_120px_minmax(180px,1fr)_auto]"
        >
          <div className="space-y-2">
            <Label>付款周期</Label>
            <Select
              value={price.billingCycle}
              onValueChange={(value) =>
                updatePrice(price.key, { billingCycle: value })
              }
            >
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">月付</SelectItem>
                <SelectItem value="quarterly">季付</SelectItem>
                <SelectItem value="semiannual">半年付</SelectItem>
                <SelectItem value="yearly">年付</SelectItem>
                <SelectItem value="biennial">两年付</SelectItem>
                <SelectItem value="triennial">三年付</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`offer-price-${price.key}`}>现价</Label>
            <Input
              id={`offer-price-${price.key}`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={price.amount}
              onChange={(event) =>
                updatePrice(price.key, { amount: event.target.value })
              }
              required
              className="min-h-11"
            />
          </div>
          <div className="space-y-2">
            <Label>币种</Label>
            <Select
              value={price.currency}
              onValueChange={(value) =>
                updatePrice(price.key, { currency: value })
              }
            >
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="CNY">CNY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`offer-original-price-${price.key}`}>原价</Label>
            <Input
              id={`offer-original-price-${price.key}`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={price.originalAmount}
              onChange={(event) =>
                updatePrice(price.key, { originalAmount: event.target.value })
              }
              className="min-h-11"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`offer-price-url-${price.key}`}>专属购买链接</Label>
              <Input
                id={`offer-price-url-${price.key}`}
                value={price.purchaseUrl}
                onChange={(event) =>
                  updatePrice(price.key, { purchaseUrl: event.target.value })
                }
                placeholder="留空使用套餐购买链接"
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`offer-price-valid-${price.key}`}>有效期</Label>
              <Input
                id={`offer-price-valid-${price.key}`}
                type="datetime-local"
                value={price.validUntil}
                onChange={(event) =>
                  updatePrice(price.key, { validUntil: event.target.value })
                }
                className="min-h-11"
              />
            </div>
          </div>
          <div className="flex items-end gap-2 pb-0.5">
            <label className="flex min-h-11 items-center gap-2 text-xs">
              <Switch
                checked={price.active}
                onCheckedChange={(checked) =>
                  updatePrice(price.key, { active: checked })
                }
              />
              启用
            </label>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`删除第 ${index + 1} 个价格`}
              title="删除价格"
              onClick={() =>
                onChange(prices.filter((item) => item.key !== price.key))
              }
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function specsText(offer: {
  cpu: string | null;
  memory: string | null;
  storage: string | null;
  bandwidth: string | null;
  traffic: string | null;
}) {
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
        <a href={safeHref} target="_blank" rel={rel} aria-label={ariaLabel}>
          {children}
        </a>
      )}
    </Button>
  );
}

function OfferEditForm({
  offer,
  providers,
  relationPosts,
  onDone,
}: {
  offer: Offer;
  providers: Provider[];
  relationPosts: RelationPost[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(offer.visible);
  const [featured, setFeatured] = useState(offer.featured);
  const [offerKind, setOfferKind] = useState<"regular" | "promotion">(
    offer.offerKind === "promotion" ? "promotion" : "regular",
  );
  const [lockedFields, setLockedFields] = useState<string[]>(
    offer.lockedFields ?? [],
  );
  const [prices, setPrices] = useState<EditablePrice[]>(() =>
    initialEditablePrices(offer),
  );
  const [relationPostId, setRelationPostId] = useState("");
  const [relationType, setRelationType] = useState<
    "review" | "mention" | "deal"
  >("review");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    formData.set("visible", visible ? "true" : "false");
    formData.set("featured", featured ? "true" : "false");
    if (formData.get("providerId") === "none") {
      formData.set("providerId", "");
    }
    formData.set("lockedFieldsJson", JSON.stringify(lockedFields));
    formData.set(
      "pricesJson",
      JSON.stringify(
        prices.map(({ key: _key, ...price }) => ({
          ...price,
          originalAmount: price.originalAmount || null,
          purchaseUrl: price.purchaseUrl || null,
          validUntil: price.validUntil || null,
        })),
      ),
    );

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

  function toggleLockedField(field: string, checked: boolean) {
    setLockedFields((current) =>
      checked
        ? [...new Set([...current, field])]
        : current.filter((item) => item !== field),
    );
  }

  function addArticleRelation() {
    const postId = Number(relationPostId);
    startTransition(async () => {
      const result = await saveServerOfferArticleRelationAction({
        offerId: offer.id,
        postId,
        relationType,
      });
      if (!result.success) {
        toast.error(result.error, { description: result.message });
        return;
      }
      toast.success(result.message ?? "文章关系已保存");
      setRelationPostId("");
      router.refresh();
    });
  }

  function removeArticleRelation(sourceId: number) {
    startTransition(async () => {
      const result = await deleteServerOfferArticleRelationAction(sourceId);
      if (!result.success) {
        toast.error(result.error, { description: result.message });
        return;
      }
      toast.success(result.message ?? "文章关系已删除");
      router.refresh();
    });
  }

  return (
    <form
      action={handleSubmit}
      className="grid gap-4 rounded-lg border border-border/70 bg-muted/20 p-4"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_220px_220px]">
        <div className="space-y-2">
          <Label htmlFor={`offer-title-${offer.id}`}>标题</Label>
          <Input
            id={`offer-title-${offer.id}`}
            name="title"
            defaultValue={offer.title}
            required
            className="min-h-11"
          />
        </div>
        <div className="space-y-2">
          <Label>关联厂商</Label>
          <Select
            name="providerId"
            defaultValue={offer.providerId ? String(offer.providerId) : "none"}
          >
            <SelectTrigger className="min-h-11">
              <SelectValue placeholder="未关联" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">未关联厂商</SelectItem>
              {providers.map((provider) => (
                <SelectItem key={provider.id} value={String(provider.id)}>
                  {provider.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`offer-provider-name-${offer.id}`}>展示商家名</Label>
          <Input
            id={`offer-provider-name-${offer.id}`}
            name="providerName"
            defaultValue={offer.providerName ?? ""}
            className="min-h-11"
          />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>套餐属性</Label>
          <Select
            name="offerKind"
            value={offerKind}
            onValueChange={(value) =>
              setOfferKind(value as "regular" | "promotion")
            }
          >
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {offerKindOptions.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`offer-external-id-${offer.id}`}>厂商产品 ID</Label>
          <Input
            id={`offer-external-id-${offer.id}`}
            name="externalProductId"
            defaultValue={offer.externalProductId ?? ""}
            placeholder="用于库存接口匹配"
            className="min-h-11 font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`offer-product-group-${offer.id}`}>产品组</Label>
          <Input
            id={`offer-product-group-${offer.id}`}
            name="productGroup"
            defaultValue={offer.productGroup ?? ""}
            placeholder="例如 Los Angeles VPS"
            className="min-h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`offer-product-type-${offer.id}`}>类型</Label>
          <Input
            id={`offer-product-type-${offer.id}`}
            name="productType"
            defaultValue={offer.productType ?? "vps"}
            placeholder="vps / cloud / dedicated"
            className="min-h-11"
          />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-2">
          <Label>CPU</Label>
          <Input name="cpu" defaultValue={offer.cpu ?? ""} placeholder="2 核" />
        </div>
        <div className="space-y-2">
          <Label>内存</Label>
          <Input
            name="memory"
            defaultValue={offer.memory ?? ""}
            placeholder="2GB RAM"
          />
        </div>
        <div className="space-y-2">
          <Label>硬盘</Label>
          <Input
            name="storage"
            defaultValue={offer.storage ?? ""}
            placeholder="40GB NVMe"
          />
        </div>
        <div className="space-y-2">
          <Label>带宽</Label>
          <Input
            name="bandwidth"
            defaultValue={offer.bandwidth ?? ""}
            placeholder="1Gbps"
          />
        </div>
        <div className="space-y-2">
          <Label>流量</Label>
          <Input
            name="traffic"
            defaultValue={offer.traffic ?? ""}
            placeholder="1TB/月"
          />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>地区</Label>
          <Input
            name="region"
            defaultValue={offer.region ?? ""}
            className="min-h-11"
          />
        </div>
        <div className="space-y-2">
          <Label>线路</Label>
          <Input
            name="lineType"
            defaultValue={offer.lineType ?? ""}
            className="min-h-11"
          />
        </div>
        <div className="space-y-2">
          <Label>状态</Label>
          <Select name="status" defaultValue={offer.status}>
            <SelectTrigger className="min-h-11">
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
            <SelectTrigger className="min-h-11">
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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_260px]">
        <div className="space-y-2">
          <Label>优惠码</Label>
          <Input
            name="promoCode"
            defaultValue={offer.promoCode ?? ""}
            className="min-h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`offer-valid-until-${offer.id}`}>套餐有效期</Label>
          <Input
            id={`offer-valid-until-${offer.id}`}
            name="validUntil"
            type="datetime-local"
            defaultValue={toDateTimeLocal(offer.validUntil)}
            className="min-h-11"
          />
        </div>
        <div className="space-y-2">
          <Label>重复 Key</Label>
          <Input value={offer.duplicateKey ?? ""} readOnly className="min-h-11" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2">
          <Label>购买链接</Label>
          <Input
            name="purchaseUrl"
            defaultValue={offer.purchaseUrl ?? ""}
            className="min-h-11"
          />
        </div>
        <div className="space-y-2">
          <Label>外部来源链接</Label>
          <Input
            name="articleUrl"
            defaultValue={offer.articleUrl ?? ""}
            className="min-h-11"
          />
        </div>
        <div className="space-y-2">
          <Label>外部测评链接</Label>
          <Input
            name="reviewUrl"
            defaultValue={offer.reviewUrl ?? ""}
            className="min-h-11"
          />
        </div>
      </div>
      <div className="space-y-3 rounded-md border border-border/70 bg-background p-3">
        <div>
          <p className="text-sm font-medium">关联文章</p>
          <p className="mt-1 text-xs text-muted-foreground">
            一个套餐可以关联多篇测评、提及或优惠文章，文章不再作为套餐数据源。
          </p>
        </div>
        {offer.articleRelations.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {offer.articleRelations.map((relation) => (
              <div
                key={relation.id}
                className="flex min-h-11 max-w-full items-center gap-2 rounded-md border border-border/70 px-2"
              >
                <Badge variant="outline">
                  {articleRelationLabels[
                    (relation.relationType ?? "mention") as keyof typeof articleRelationLabels
                  ] ?? relation.relationType}
                </Badge>
                <Link
                  href={`/posts/edit/post/${encodeURIComponent(relation.postSlug)}`}
                  className="max-w-72 truncate text-sm hover:text-primary hover:underline"
                  title={relation.postTitle}
                >
                  {relation.postTitle}
                </Link>
                <span className="text-xs uppercase text-muted-foreground">
                  {relation.postLanguage === "en" ? "EN" : "中文"}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="删除文章关系"
                  aria-label={`删除文章关系 ${relation.postTitle}`}
                  disabled={isPending}
                  onClick={() => removeArticleRelation(relation.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">暂未关联文章。</p>
        )}
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_160px_auto]">
          <Select value={relationPostId} onValueChange={setRelationPostId}>
            <SelectTrigger className="min-h-11">
              <SelectValue placeholder="选择文章" />
            </SelectTrigger>
            <SelectContent>
              {relationPosts.map((post) => (
                <SelectItem key={post.id} value={String(post.id)}>
                  {post.language === "en" ? "[EN]" : "[中文]"} {post.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={relationType}
            onValueChange={(value) =>
              setRelationType(value as "review" | "mention" | "deal")
            }
          >
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="review">测评</SelectItem>
              <SelectItem value="mention">提及</SelectItem>
              <SelectItem value="deal">优惠</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={isPending || !relationPostId}
            onClick={addArticleRelation}
          >
            <Plus className="size-4" />
            添加关系
          </Button>
        </div>
      </div>
      <div className="rounded-md border border-border/70 bg-background p-3">
        <PriceRowsEditor prices={prices} onChange={setPrices} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        {offerKind === "promotion" ? (
          <>
            <fieldset className="rounded-md border border-border/70 bg-background p-3">
              <legend className="px-1 text-sm font-medium">自动监控锁定字段</legend>
              <p className="mb-3 text-xs text-muted-foreground">
                锁定后，供应商官网采集不会覆盖对应的人工内容。
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-3">
                {([
                  ["title", "标题"],
                  ["offerKind", "套餐属性"],
                  ["specs", "配置规格"],
                  ["location", "地区与线路"],
                  ["status", "库存状态"],
                  ["price", "价格"],
                  ["purchaseUrl", "购买链接"],
                  ["promoCode", "优惠码"],
                ] as const).map(([field, label]) => (
                  <label
                    key={field}
                    className="flex min-h-11 items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={lockedFields.includes(field)}
                      onCheckedChange={(checked) =>
                        toggleLockedField(field, checked === true)
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="rounded-md border border-border/70 bg-background p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Activity className="size-4 text-muted-foreground" />
                最近探测
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                当前状态：{offer.checkStatus} · 上次探测：
                {offer.lastCheckedAt
                  ? toDateTimeLocal(offer.lastCheckedAt).replace("T", " ")
                  : "无"}
              </p>
              <div className="mt-3 space-y-2">
                {offer.recentChecks.length > 0 ? (
                  offer.recentChecks.map((check) => (
                    <div
                      key={check.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-xs first:border-t-0 first:pt-0"
                    >
                      <span>
                        {toDateTimeLocal(check.checkedAt).replace("T", " ")} ·{" "}
                        {check.status}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {check.priceAmount
                          ? `${check.currency === "CNY" ? "¥" : "$"}${check.priceAmount}`
                          : "无价格"}
                        {check.responseTimeMs === null
                          ? ""
                          : ` · ${check.responseTimeMs} ms`}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">暂无探测记录。</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-md border border-border/70 bg-background p-3 lg:col-span-2">
            <p className="text-sm font-medium">常规款由后台人工维护</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              当前套餐不会进入厂商库存探测，库存状态、价格和购买链接以本页保存内容为准。
            </p>
          </div>
        )}
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
  providers,
  relationPosts,
  totalCount,
  initialFilters,
}: {
  offers: Offer[];
  providers: Provider[];
  relationPosts: RelationPost[];
  totalCount: number;
  initialFilters: ServerOfferTableFilters;
}) {
  const router = useRouter();
  const updateUrlQuery = useUrlQueryUpdater();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [bulkStatus, setBulkStatus] = useState("in_stock");
  const [bulkKind, setBulkKind] = useState("regular");
  const [bulkReviewStatus, setBulkReviewStatus] = useState("reviewed");
  const [isPending, startTransition] = useTransition();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const activeFilters = {
    pageNo: initialFilters.pageNo,
    query: initialFilters.query,
    kind: normalizeFilterValue(initialFilters.kind, [
      "all",
      ...offerKindOptions.map(([value]) => value),
    ]),
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
  const pageSize = 20;
  const totalPage = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(activeFilters.pageNo, 1), totalPage);
  const pagedOffers = offers;
  const hasSelectedOffers = selectedIds.length > 0;

  function toggleSelected(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function runBulk(input: {
    offerKind?: string;
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
        description={`筛选条件和页码会写入地址栏，当前匹配 ${totalCount} 条套餐。`}
        searchValue={activeFilters.query}
        onSearchChange={(value) => updateUrlQuery({ query: value || null })}
        searchPlaceholder="搜索套餐、商家、地区、线路、配置或优惠码"
        filterSlot={
          <>
            <Select
              value={activeFilters.kind}
              onValueChange={(value) =>
                updateUrlQuery({ kind: value === "all" ? null : value })
              }
            >
              <SelectTrigger className="min-h-11 w-full border-border/70 bg-background shadow-none focus:ring-0 sm:w-[120px] sm:border-0 sm:bg-transparent sm:px-0">
                <SelectValue placeholder="属性" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部属性</SelectItem>
                {offerKindOptions.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-background p-3">
        <div className="text-sm text-muted-foreground">
          已选择 {selectedIds.length} / {totalCount} 条
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={bulkKind} onValueChange={setBulkKind}>
            <SelectTrigger className="min-h-11 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {offerKindOptions.map(([value, label]) => (
                <SelectItem key={value} value={value}>
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
            title={hasSelectedOffers ? "批量修改套餐属性" : "请先选择套餐"}
            onClick={() => runBulk({ offerKind: bulkKind })}
          >
            批量改属性
          </Button>
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
            title={
              hasSelectedOffers ? "批量修改所选套餐审核状态" : "请先选择套餐"
            }
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

      <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
        <Table className="min-w-[1120px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>套餐</TableHead>
              <TableHead>价格</TableHead>
              <TableHead>配置</TableHead>
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
                <TableCell colSpan={9}>
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
                      {offer.sourcePostTitle ? (
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          来源：{offer.sourcePostTitle}
                        </p>
                      ) : offer.sourcePostId ? (
                        <p className="text-xs text-muted-foreground">
                          来源文章 #{offer.sourcePostId}
                        </p>
                      ) : null}
                      {offer.externalProductId ? (
                        <p className="font-mono text-xs text-muted-foreground">
                          PID {offer.externalProductId}
                          {offer.productGroup ? ` · ${offer.productGroup}` : ""}
                        </p>
                      ) : offer.productGroup ? (
                        <p className="text-xs text-muted-foreground">
                          {offer.productGroup}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {offerKindLabels[
                            offer.offerKind as keyof typeof offerKindLabels
                          ] ?? "常规款"}
                        </Badge>
                        {offer.providerName ? (
                          <Badge variant="secondary">
                            {offer.providerName}
                          </Badge>
                        ) : null}
                        {offer.featured ? <Badge>推荐</Badge> : null}
                        {!offer.visible ? (
                          <Badge variant="outline">隐藏</Badge>
                        ) : null}
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
                    {offer.monthlyPriceUsd ? (
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        约 ${Number(offer.monthlyPriceUsd).toFixed(2)} / 月
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="min-w-[240px]">
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {specsText(offer) || "配置待补充"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p>{offer.region ?? "-"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {offer.lineType ?? "-"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        offer.status === "in_stock" ? "default" : "secondary"
                      }
                    >
                      {offerStatusLabels[
                        offer.status as keyof typeof offerStatusLabels
                      ] ?? offer.status}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {offer.offerKind === "promotion"
                        ? offer.checkStatus === "ok"
                          ? "探测正常"
                          : offer.checkStatus === "failed"
                            ? "探测失败"
                            : "待探测"
                        : "人工维护"}
                    </p>
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
                        来源
                      </SafeAdminOfferLink>
                      <SafeAdminOfferLink href={offer.reviewUrl}>
                        测评
                      </SafeAdminOfferLink>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setEditId((value) =>
                          value === offer.id ? null : offer.id,
                        )
                      }
                    >
                      编辑
                    </Button>
                  </TableCell>
                </TableRow>
                {editId === offer.id ? (
                  <TableRow>
                    <TableCell colSpan={9} className="bg-muted/20">
                      <OfferEditForm
                        offer={offer}
                        providers={providers}
                        relationPosts={relationPosts}
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
