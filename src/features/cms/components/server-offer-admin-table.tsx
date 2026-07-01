"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, useTransition } from "react";
import { ExternalLink, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  bulkUpdateServerOffersAction,
  updateServerOfferAction,
} from "@/features/cms/actions/server-offers";
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

type Offer = Awaited<ReturnType<typeof getAdminServerOffers>>[number];

const offerStatusLabels = {
  in_stock: "有货",
  out_of_stock: "没货",
  restocking: "补货",
  discontinued: "停售",
  preorder: "预售",
} as const;

const statusOptions = Object.entries(offerStatusLabels);

function formatPrice(offer: Offer) {
  if (!offer.priceAmount) return "待补充";
  return `${offer.currency === "CNY" ? "¥" : "$"}${Number(offer.priceAmount).toFixed(2)}`;
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
          <Label>优惠码</Label>
          <Input name="promoCode" defaultValue={offer.promoCode ?? ""} />
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

export function ServerOfferAdminTable({ offers }: { offers: Offer[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [bulkStatus, setBulkStatus] = useState("in_stock");
  const [isPending, startTransition] = useTransition();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggleSelected(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function runBulk(input: { status?: string; visible?: boolean; featured?: boolean }) {
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-background p-3 shadow-sm">
        <div className="text-sm text-muted-foreground">
          已选择 {selectedIds.length} / {offers.length} 条
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={bulkStatus} onValueChange={setBulkStatus}>
            <SelectTrigger className="h-9 w-28">
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
            disabled={isPending}
            onClick={() => runBulk({ status: bulkStatus })}
          >
            批量改状态
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => runBulk({ visible: false })}
          >
            批量隐藏
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => runBulk({ visible: true })}
          >
            批量显示
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-background shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>套餐</TableHead>
              <TableHead>价格</TableHead>
              <TableHead>地区/线路</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>入口</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.map((offer) => (
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
                    <div className="flex gap-2">
                      {offer.purchaseUrl ? (
                        <Button asChild size="icon" variant="outline">
                          <a href={offer.purchaseUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-4" />
                          </a>
                        </Button>
                      ) : null}
                      {offer.articleUrl ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={offer.articleUrl}>文章</Link>
                        </Button>
                      ) : null}
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
                    <TableCell colSpan={7} className="bg-muted/20">
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
    </div>
  );
}
