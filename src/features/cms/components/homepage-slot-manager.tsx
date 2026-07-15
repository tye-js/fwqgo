"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  deleteHomepageSlotAction,
  saveHomepageSlotAction,
} from "@/features/cms/actions/homepage-slots";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  getAdminHomepageSlots,
  getHomepageSlotOptions,
  HomepageSlotContentType,
  HomepageSlotLanguage,
  HomepageSlotPlacement,
} from "@/server/homepage/homepage-slots";

type Slot = Awaited<ReturnType<typeof getAdminHomepageSlots>>[number];
type SlotOptions = Awaited<ReturnType<typeof getHomepageSlotOptions>>;

const placementLabels: Record<string, string> = {
  hero_primary: "首屏主推广",
  promo_grid: "推广内容区",
  featured_offers: "精选套餐",
  sidebar: "文章侧栏",
};

const contentTypeLabels: Record<string, string> = {
  post: "文章",
  offer: "套餐",
  image_link: "推广图片",
};

function toDateTimeLocal(value: Date | null) {
  if (!value) return "";
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function displayContent(slot: Slot) {
  if (slot.contentType === "post")
    return slot.postTitle ?? `文章 #${slot.postId}`;
  if (slot.contentType === "offer")
    return slot.offerTitle ?? `套餐 #${slot.offerId}`;
  return slot.title ?? slot.imagePath ?? `图片 #${slot.imageAssetId}`;
}

function getFormDataText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function scheduleState(slot: Slot, referenceTime: number) {
  if (!slot.enabled) return { label: "已停用", variant: "outline" as const };
  if (slot.startsAt && slot.startsAt.getTime() > referenceTime) {
    return { label: "待上线", variant: "secondary" as const };
  }
  if (slot.endsAt && slot.endsAt.getTime() <= referenceTime) {
    return { label: "已下线", variant: "outline" as const };
  }
  return { label: "展示中", variant: "default" as const };
}

function showFailure(result: {
  error: string;
  message: string;
  actionError?: { suggestion?: string };
}) {
  toast.error(result.error, {
    description: [result.message, result.actionError?.suggestion]
      .filter(Boolean)
      .join("；"),
  });
}

function SlotEditor({
  slot,
  language,
  options,
  open,
  onOpenChange,
}: {
  slot: Slot | null;
  language: HomepageSlotLanguage;
  options: SlotOptions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [contentType, setContentType] = useState<HomepageSlotContentType>(
    (slot?.contentType as HomepageSlotContentType) ?? "post",
  );
  const [enabled, setEnabled] = useState(slot?.enabled ?? true);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const placement = getFormDataText(
        formData,
        "placement",
      ) as HomepageSlotPlacement;
      const result = await saveHomepageSlotAction({
        id: slot?.id ?? null,
        language,
        placement,
        contentType,
        postId: formData.get("postId"),
        offerId: formData.get("offerId"),
        imageAssetId: formData.get("imageAssetId"),
        title: formData.get("title"),
        description: formData.get("description"),
        targetUrl: formData.get("targetUrl"),
        altText: formData.get("altText"),
        sortOrder: Number(formData.get("sortOrder")),
        startsAt: formData.get("startsAt"),
        endsAt: formData.get("endsAt"),
        enabled,
      });
      if (!result.success) {
        showFailure(result);
        return;
      }
      toast.success(result.message ?? "首页推广位已保存", {
        description: `${placementLabels[placement] ?? "首页"} · ${contentTypeLabels[contentType]}`,
      });
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {slot ? "编辑首页推广位" : "新增首页推广位"}
          </DialogTitle>
          <DialogDescription>
            当前配置{language === "en" ? "英文" : "中文"}
            首页。排序值越小，在同一位置越靠前。
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>展示位置</Label>
              <Select
                name="placement"
                defaultValue={slot?.placement ?? "promo_grid"}
              >
                <SelectTrigger className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(placementLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>内容类型</Label>
              <Select
                value={contentType}
                onValueChange={(value) =>
                  setContentType(value as HomepageSlotContentType)
                }
              >
                <SelectTrigger className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="post">文章</SelectItem>
                  <SelectItem value="offer">套餐</SelectItem>
                  <SelectItem value="image_link">推广图片</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {contentType === "post" ? (
            <div className="space-y-2">
              <Label>推广文章</Label>
              <Select
                name="postId"
                defaultValue={slot?.postId ? String(slot.postId) : undefined}
              >
                <SelectTrigger className="min-h-11">
                  <SelectValue placeholder="选择已发布文章" />
                </SelectTrigger>
                <SelectContent>
                  {options.postOptions.map((post) => (
                    <SelectItem key={post.id} value={String(post.id)}>
                      {post.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {contentType === "offer" ? (
            <div className="space-y-2">
              <Label>推广套餐</Label>
              <Select
                name="offerId"
                defaultValue={slot?.offerId ? String(slot.offerId) : undefined}
              >
                <SelectTrigger className="min-h-11">
                  <SelectValue placeholder="选择可见套餐" />
                </SelectTrigger>
                <SelectContent>
                  {options.offerOptions.map((offer) => (
                    <SelectItem key={offer.id} value={String(offer.id)}>
                      {offer.providerName ? `${offer.providerName} · ` : ""}
                      {offer.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>
              {contentType === "image_link" ? "推广图片" : "自定义图片（可选）"}
            </Label>
            <Select
              name="imageAssetId"
              defaultValue={
                slot?.imageAssetId ? String(slot.imageAssetId) : "none"
              }
            >
              <SelectTrigger className="min-h-11">
                <SelectValue placeholder="选择图片资产" />
              </SelectTrigger>
              <SelectContent>
                {contentType !== "image_link" ? (
                  <SelectItem value="none">使用内容默认图片</SelectItem>
                ) : null}
                {options.imageOptions.map((image) => (
                  <SelectItem key={image.id} value={String(image.id)}>
                    {image.originalName} · #{image.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slot-title">自定义标题</Label>
              <Input
                id="slot-title"
                name="title"
                defaultValue={slot?.title ?? ""}
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slot-alt">图片 Alt</Label>
              <Input
                id="slot-alt"
                name="altText"
                defaultValue={slot?.altText ?? ""}
                className="min-h-11"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="slot-description">自定义说明</Label>
            <Textarea
              id="slot-description"
              name="description"
              defaultValue={slot?.description ?? ""}
              className="min-h-24"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slot-target">目标链接</Label>
            <Input
              id="slot-target"
              name="targetUrl"
              defaultValue={slot?.targetUrl ?? ""}
              placeholder={
                contentType === "image_link"
                  ? "必填：/servers 或 https://..."
                  : "留空使用内容默认链接"
              }
              className="min-h-11"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="slot-sort">排序值</Label>
              <Input
                id="slot-sort"
                name="sortOrder"
                type="number"
                defaultValue={slot?.sortOrder ?? 0}
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slot-start">上线时间</Label>
              <Input
                id="slot-start"
                name="startsAt"
                type="datetime-local"
                defaultValue={toDateTimeLocal(slot?.startsAt ?? null)}
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slot-end">下线时间</Label>
              <Input
                id="slot-end"
                name="endsAt"
                type="datetime-local"
                defaultValue={toDateTimeLocal(slot?.endsAt ?? null)}
                className="min-h-11"
              />
            </div>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-4 rounded-md border border-border/70 px-3">
            <span className="text-sm font-medium">启用推广位</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "保存中..." : "保存推广位"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function HomepageSlotManager({
  slots,
  options,
  language,
  referenceTime,
}: {
  slots: Slot[];
  options: SlotOptions;
  language: HomepageSlotLanguage;
  referenceTime: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Slot | null>(null);
  const [deleting, setDeleting] = useState<Slot | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function openEditor(slot: Slot | null) {
    setEditing(slot);
    setDialogOpen(true);
  }

  function remove(slot: Slot) {
    startTransition(async () => {
      const result = await deleteHomepageSlotAction(slot.id);
      if (!result.success) {
        showFailure(result);
        return;
      }
      toast.success(result.message ?? "首页推广位已删除");
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => openEditor(null)}>
          <Plus className="size-4" />
          新增推广位
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
        <Table className="min-w-[880px]">
          <TableHeader>
            <TableRow>
              <TableHead>位置 / 排序</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>内容</TableHead>
              <TableHead>时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slots.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  尚未配置新推广位，前台会继续使用旧推荐数据作为兜底。
                </TableCell>
              </TableRow>
            ) : null}
            {slots.map((slot) => {
              const state = scheduleState(slot, referenceTime);
              return (
                <TableRow key={slot.id}>
                  <TableCell>
                    <p className="font-medium">
                      {placementLabels[slot.placement] ?? slot.placement}
                    </p>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                      排序 {slot.sortOrder}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {contentTypeLabels[slot.contentType] ?? slot.contentType}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-96">
                    <p
                      className="truncate font-medium"
                      title={displayContent(slot)}
                    >
                      {displayContent(slot)}
                    </p>
                    {slot.targetUrl ? (
                      <p
                        className="mt-1 truncate font-mono text-xs text-muted-foreground"
                        title={slot.targetUrl}
                      >
                        {slot.targetUrl}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    <p>
                      上线：
                      {toDateTimeLocal(slot.startsAt).replace("T", " ") ||
                        "立即"}
                    </p>
                    <p className="mt-1">
                      下线：
                      {toDateTimeLocal(slot.endsAt).replace("T", " ") || "长期"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={state.variant}>{state.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label={`编辑 ${displayContent(slot)}`}
                        title="编辑"
                        disabled={isPending}
                        onClick={() => openEditor(slot)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label={`删除 ${displayContent(slot)}`}
                        title="删除"
                        disabled={isPending}
                        onClick={() => setDeleting(slot)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {dialogOpen ? (
        <SlotEditor
          key={editing?.id ?? "new"}
          slot={editing}
          language={language}
          options={options}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : null}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !isPending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除首页推广位？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `将从首页配置中删除“${displayContent(deleting)}”，关联的文章、套餐和图片资产不会被删除。`
                : "删除后无法恢复。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending || !deleting}
              onClick={(event) => {
                event.preventDefault();
                if (deleting) remove(deleting);
              }}
            >
              {isPending ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
