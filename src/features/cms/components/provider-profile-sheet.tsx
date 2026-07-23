"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSearch,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  TriangleAlert,
  Trash2,
  XCircle,
} from "lucide-react";

import {
  applyProviderProfileSnapshot,
  deleteProviderPromoCode,
  rejectProviderProfileSnapshot,
  saveProviderProfile,
  saveProviderPromoCode,
  startProviderProfileCollection,
} from "@/features/cms/actions/provider-profiles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  describeAdminResult,
  notifyError,
  notifyInfo,
  notifySuccess,
} from "@/lib/admin-toast";
import { useUnsavedChangesGuard } from "@/features/cms/hooks/use-unsaved-changes-guard";
import type {
  AffProviderTableData,
  ProviderProfileSnapshotData,
  ProviderProfileSnapshotStatus,
  ProviderPromoCodeData,
} from "@/types";

const ACTION_TIMEOUT_MS = 15_000;

type PromoFormState = {
  id?: number;
  code: string;
  description: string;
  discountText: string;
  terms: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  isDefault: boolean;
  sourceUrl: string;
};

type ProviderProfileFormState = {
  summary: string;
  summarySourceUrl: string;
  refundPolicy: string;
  refundPolicySourceUrl: string;
  prohibitedUses: string;
  prohibitedUsesSourceUrl: string;
  markVerified: boolean;
};

const emptyPromoForm: PromoFormState = {
  code: "",
  description: "",
  discountText: "",
  terms: "",
  startsAt: "",
  endsAt: "",
  active: true,
  isDefault: false,
  sourceUrl: "",
};

function getProviderProfileForm(
  provider: AffProviderTableData,
): ProviderProfileFormState {
  return {
    summary: provider.summary ?? "",
    summarySourceUrl: provider.summarySourceUrl ?? "",
    refundPolicy: provider.refundPolicy ?? "",
    refundPolicySourceUrl: provider.refundPolicySourceUrl ?? "",
    prohibitedUses: provider.prohibitedUses ?? "",
    prohibitedUsesSourceUrl: provider.prohibitedUsesSourceUrl ?? "",
    markVerified: Boolean(provider.profileVerifiedAt),
  };
}

function providerProfileFormsEqual(
  left: ProviderProfileFormState,
  right: ProviderProfileFormState,
) {
  return (
    left.summary === right.summary &&
    left.summarySourceUrl === right.summarySourceUrl &&
    left.refundPolicy === right.refundPolicy &&
    left.refundPolicySourceUrl === right.refundPolicySourceUrl &&
    left.prohibitedUses === right.prohibitedUses &&
    left.prohibitedUsesSourceUrl === right.prohibitedUsesSourceUrl &&
    left.markVerified === right.markVerified
  );
}

function promoFormsEqual(left: PromoFormState, right: PromoFormState) {
  return (
    left.id === right.id &&
    left.code === right.code &&
    left.description === right.description &&
    left.discountText === right.discountText &&
    left.terms === right.terms &&
    left.startsAt === right.startsAt &&
    left.endsAt === right.endsAt &&
    left.active === right.active &&
    left.isDefault === right.isDefault &&
    left.sourceUrl === right.sourceUrl
  );
}

function getPromoForm(promo: ProviderPromoCodeData | null): PromoFormState {
  return promo
    ? {
        id: promo.id,
        code: promo.code,
        description: promo.description ?? "",
        discountText: promo.discountText ?? "",
        terms: promo.terms ?? "",
        startsAt: toDateTimeLocal(promo.startsAt),
        endsAt: toDateTimeLocal(promo.endsAt),
        active: promo.active,
        isDefault: promo.isDefault,
        sourceUrl: promo.sourceUrl ?? "",
      }
    : emptyPromoForm;
}

function withTimeout<T>(promise: Promise<T>, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ACTION_TIMEOUT_MS);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function formatDate(value: string | null) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间无效";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
}

function toIsoDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("优惠码时间格式不正确");
  return date.toISOString();
}

function getOfficialHref(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function getSnapshotStatusMeta(status: ProviderProfileSnapshotStatus | null) {
  switch (status) {
    case "queued":
      return { label: "等待采集", variant: "secondary" as const, icon: Clock3 };
    case "running":
      return {
        label: "正在采集",
        variant: "secondary" as const,
        icon: RefreshCw,
      };
    case "pending":
      return { label: "待审核", variant: "default" as const, icon: FileSearch };
    case "applied":
      return {
        label: "已应用",
        variant: "outline" as const,
        icon: CheckCircle2,
      };
    case "rejected":
      return { label: "已驳回", variant: "outline" as const, icon: XCircle };
    case "failed":
      return {
        label: "采集失败",
        variant: "destructive" as const,
        icon: XCircle,
      };
    default:
      return {
        label: "尚未采集",
        variant: "outline" as const,
        icon: FileSearch,
      };
  }
}

function getPromoStatus(promo: ProviderPromoCodeData) {
  const now = Date.now();
  const startsAt = promo.startsAt ? new Date(promo.startsAt).getTime() : null;
  const endsAt = promo.endsAt ? new Date(promo.endsAt).getTime() : null;
  if (!promo.active) return { label: "已停用", variant: "outline" as const };
  if (startsAt && startsAt > now) {
    return { label: "未开始", variant: "secondary" as const };
  }
  if (endsAt && endsAt < now) {
    return { label: "已过期", variant: "destructive" as const };
  }
  return { label: "有效", variant: "default" as const };
}

function SourceLink({ url }: { url: string | null }) {
  if (!url)
    return <span className="text-xs text-muted-foreground">无来源</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
    >
      <span className="truncate">{url}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

function PromoCodeDialog({
  providerId,
  promo,
  open,
  onOpenChange,
  onBusyChange,
  onDirtyChange,
  onSaved,
}: {
  providerId: number;
  promo: ProviderPromoCodeData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
}) {
  const [initialForm] = useState(() => getPromoForm(promo));
  const [form, setForm] = useState<PromoFormState>(initialForm);
  const [savedForm, setSavedForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const formDirty = !promoFormsEqual(form, savedForm);

  useEffect(() => {
    onDirtyChange(formDirty);
  }, [formDirty, onDirtyChange]);

  useEffect(() => {
    return () => onDirtyChange(false);
  }, [onDirtyChange]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (saving) return;
    if (formDirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }

  async function handleSave() {
    if (!form.code.trim()) {
      notifyError({
        title: "优惠码保存失败",
        description: "请填写优惠码。",
      });
      return;
    }

    setSaving(true);
    onBusyChange(true);
    try {
      const result = await withTimeout(
        saveProviderPromoCode({
          id: form.id,
          providerId,
          code: form.code,
          description: form.description,
          discountText: form.discountText,
          terms: form.terms,
          startsAt: toIsoDate(form.startsAt),
          endsAt: toIsoDate(form.endsAt),
          active: form.active,
          isDefault: form.isDefault,
          sourceUrl: form.sourceUrl,
        }),
        "优惠码保存超时，请稍后重试",
      );
      if (!result.success) {
        notifyError({
          title: result.errorTitle,
          description: result.message,
        });
        return;
      }

      notifySuccess({
        title: "优惠码已保存",
        description: describeAdminResult([
          result.data.code,
          result.data.discountText,
          result.data.isDefault ? "默认优惠码" : null,
        ]),
      });
      setSavedForm(form);
      onDirtyChange(false);
      onOpenChange(false);
      onSaved();
    } catch (error) {
      notifyError({
        title: "优惠码保存失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{promo ? "编辑优惠码" : "新增优惠码"}</DialogTitle>
            <DialogDescription>供应商 #{providerId}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="provider-promo-code">优惠码</Label>
              <Input
                id="provider-promo-code"
                value={form.code}
                disabled={saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    code: event.target.value,
                  }))
                }
                placeholder="SAVE20"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="provider-promo-discount">优惠内容</Label>
              <Input
                id="provider-promo-discount"
                value={form.discountText}
                disabled={saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    discountText: event.target.value,
                  }))
                }
                placeholder="首年 8 折"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="provider-promo-description">说明</Label>
              <Input
                id="provider-promo-description"
                value={form.description}
                disabled={saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="适用产品或活动"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="provider-promo-start">开始时间</Label>
              <Input
                id="provider-promo-start"
                type="datetime-local"
                value={form.startsAt}
                disabled={saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    startsAt: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="provider-promo-end">结束时间</Label>
              <Input
                id="provider-promo-end"
                type="datetime-local"
                value={form.endsAt}
                disabled={saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    endsAt: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="provider-promo-terms">使用条件</Label>
              <Textarea
                id="provider-promo-terms"
                className="min-h-24"
                value={form.terms}
                disabled={saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    terms: event.target.value,
                  }))
                }
                placeholder="产品范围、付款周期、次数限制等"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="provider-promo-source">来源 URL</Label>
              <Input
                id="provider-promo-source"
                value={form.sourceUrl}
                disabled={saving}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sourceUrl: event.target.value,
                  }))
                }
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 border-t pt-4">
            <div className="flex items-center gap-2">
              <Switch
                id="provider-promo-active"
                checked={form.active}
                disabled={saving}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    active: checked,
                    isDefault: checked ? current.isDefault : false,
                  }))
                }
              />
              <Label htmlFor="provider-promo-active">启用</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="provider-promo-default"
                checked={form.isDefault}
                disabled={saving || !form.active}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, isDefault: checked }))
                }
              />
              <Label htmlFor="provider-promo-default">默认优惠码</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => handleOpenChange(false)}
            >
              取消
            </Button>
            <Button disabled={saving} onClick={handleSave}>
              <Save className="size-4" />
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃优惠码修改？</AlertDialogTitle>
            <AlertDialogDescription>
              当前优惠码有尚未保存的内容，关闭后这些修改将丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setSavedForm(form);
                onDirtyChange(false);
                onOpenChange(false);
              }}
            >
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ProviderCandidateReview({
  snapshot,
  providerName,
  applyBlocked,
  onApplied,
  onBusyChange,
  onDirtyChange,
  onStatusChange,
}: {
  snapshot: ProviderProfileSnapshotData;
  providerName: string;
  applyBlocked: boolean;
  onApplied: (input: {
    summary: string;
    refundPolicy: string;
    prohibitedUses: string;
  }) => void;
  onBusyChange: (busy: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onStatusChange: (status: "applied" | "rejected") => void;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(snapshot.summary ?? "");
  const [refundPolicy, setRefundPolicy] = useState(snapshot.refundPolicy ?? "");
  const [prohibitedUses, setProhibitedUses] = useState(
    snapshot.prohibitedUses ?? "",
  );
  const [reviewing, setReviewing] = useState<"apply" | "reject" | null>(null);
  const candidateDirty =
    summary !== (snapshot.summary ?? "") ||
    refundPolicy !== (snapshot.refundPolicy ?? "") ||
    prohibitedUses !== (snapshot.prohibitedUses ?? "");

  useEffect(() => {
    onDirtyChange(candidateDirty);
  }, [candidateDirty, onDirtyChange]);

  useEffect(() => {
    return () => onDirtyChange(false);
  }, [onDirtyChange]);

  async function handleApply() {
    if (applyBlocked) {
      notifyInfo({
        title: "请先完成正式档案保存",
        description: "正式档案正在保存或有未保存修改，完成后再应用采集候选。",
      });
      return;
    }

    setReviewing("apply");
    onBusyChange(true);
    try {
      const result = await withTimeout(
        applyProviderProfileSnapshot({
          snapshotId: snapshot.id,
          summary,
          refundPolicy,
          prohibitedUses,
        }),
        "采集结果应用超时，请稍后重试",
      );
      if (!result.success) {
        notifyError({
          title: result.errorTitle,
          description: result.message,
        });
        return;
      }

      onApplied({ summary, refundPolicy, prohibitedUses });
      onDirtyChange(false);
      onStatusChange("applied");
      notifySuccess({
        title: "采集结果已应用",
        description: providerName,
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "采集结果应用失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setReviewing(null);
      onBusyChange(false);
    }
  }

  async function handleReject() {
    setReviewing("reject");
    onBusyChange(true);
    try {
      const result = await withTimeout(
        rejectProviderProfileSnapshot({ snapshotId: snapshot.id }),
        "采集结果驳回超时，请稍后重试",
      );
      if (!result.success) {
        notifyError({
          title: result.errorTitle,
          description: result.message,
        });
        return;
      }

      onDirtyChange(false);
      onStatusChange("rejected");
      notifySuccess({
        title: "采集结果已驳回",
        description: providerName,
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "采集结果驳回失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setReviewing(null);
      onBusyChange(false);
    }
  }

  return (
    <div className="mt-5 space-y-5 border-t pt-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`candidate-provider-summary-${snapshot.id}`}>
            供应商介绍候选
          </Label>
          <SourceLink url={snapshot.summarySourceUrl} />
        </div>
        <Textarea
          id={`candidate-provider-summary-${snapshot.id}`}
          className="min-h-28"
          value={summary}
          disabled={reviewing !== null}
          onChange={(event) => setSummary(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`candidate-provider-refund-${snapshot.id}`}>
            退款政策候选
          </Label>
          <SourceLink url={snapshot.refundPolicySourceUrl} />
        </div>
        <Textarea
          id={`candidate-provider-refund-${snapshot.id}`}
          className="min-h-40"
          value={refundPolicy}
          disabled={reviewing !== null}
          onChange={(event) => setRefundPolicy(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`candidate-provider-prohibited-${snapshot.id}`}>
            禁止事项候选
          </Label>
          <SourceLink url={snapshot.prohibitedUsesSourceUrl} />
        </div>
        <Textarea
          id={`candidate-provider-prohibited-${snapshot.id}`}
          className="min-h-40"
          value={prohibitedUses}
          disabled={reviewing !== null}
          onChange={(event) => setProhibitedUses(event.target.value)}
        />
      </div>
      {applyBlocked ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          正式档案正在保存或有未保存修改，请完成保存后再应用采集候选。
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={reviewing !== null}>
              <XCircle className="size-4" />
              {reviewing === "reject" ? "驳回中..." : "驳回"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>驳回这次采集结果？</AlertDialogTitle>
              <AlertDialogDescription>
                候选内容不会写入正式档案，本次快照将标记为已驳回。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleReject}
              >
                确认驳回
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button
          disabled={reviewing !== null || applyBlocked}
          onClick={handleApply}
        >
          <CheckCircle2 className="size-4" />
          {reviewing === "apply" ? "应用中..." : "应用到档案"}
        </Button>
      </div>
    </div>
  );
}

export function ProviderProfileSheet({
  provider,
  open,
  onOpenChange,
}: {
  provider: AffProviderTableData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(provider.summary ?? "");
  const [summarySourceUrl, setSummarySourceUrl] = useState(
    provider.summarySourceUrl ?? "",
  );
  const [refundPolicy, setRefundPolicy] = useState(provider.refundPolicy ?? "");
  const [refundPolicySourceUrl, setRefundPolicySourceUrl] = useState(
    provider.refundPolicySourceUrl ?? "",
  );
  const [prohibitedUses, setProhibitedUses] = useState(
    provider.prohibitedUses ?? "",
  );
  const [prohibitedUsesSourceUrl, setProhibitedUsesSourceUrl] = useState(
    provider.prohibitedUsesSourceUrl ?? "",
  );
  const [markVerified, setMarkVerified] = useState(
    Boolean(provider.profileVerifiedAt),
  );
  const [savedProfile, setSavedProfile] = useState(() =>
    getProviderProfileForm(provider),
  );
  const [optimisticSnapshot, setOptimisticSnapshot] = useState<{
    id: number;
    status: ProviderProfileSnapshotStatus;
  } | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [promoDialogOpen, setPromoDialogOpen] = useState(false);
  const [editingPromo, setEditingPromo] =
    useState<ProviderPromoCodeData | null>(null);
  const [deletingPromoId, setDeletingPromoId] = useState<number | null>(null);
  const [candidateDirty, setCandidateDirty] = useState(false);
  const [candidateReviewing, setCandidateReviewing] = useState(false);
  const [promoDirty, setPromoDirty] = useState(false);
  const [promoSaving, setPromoSaving] = useState(false);
  const [pendingExit, setPendingExit] = useState<{
    href: string | null;
  } | null>(null);
  const profileForm: ProviderProfileFormState = {
    summary,
    summarySourceUrl,
    refundPolicy,
    refundPolicySourceUrl,
    prohibitedUses,
    prohibitedUsesSourceUrl,
    markVerified,
  };
  const profileDirty = !providerProfileFormsEqual(profileForm, savedProfile);
  const hasUnsavedChanges = profileDirty || candidateDirty || promoDirty;
  const exitBusy = savingProfile || candidateReviewing || promoSaving;
  const serverSnapshot = provider.latestSnapshot;
  const visibleSnapshot =
    !optimisticSnapshot || serverSnapshot?.id === optimisticSnapshot.id
      ? serverSnapshot
      : null;
  const latestStatus = serverSnapshot?.status ?? null;
  const effectiveStatus = (() => {
    if (!optimisticSnapshot) return latestStatus;
    if (serverSnapshot?.id !== optimisticSnapshot.id)
      return optimisticSnapshot.status;
    if (optimisticSnapshot.status === "queued") return latestStatus;
    if (
      (optimisticSnapshot.status === "applied" ||
        optimisticSnapshot.status === "rejected") &&
      latestStatus === "pending"
    ) {
      return optimisticSnapshot.status;
    }
    return latestStatus;
  })();

  useUnsavedChangesGuard({
    enabled: open && (hasUnsavedChanges || exitBusy),
    onNavigationAttempt: (href) => {
      if (exitBusy) return;
      setPendingExit({ href });
    },
  });

  useEffect(() => {
    if (
      !open ||
      (effectiveStatus !== "queued" && effectiveStatus !== "running")
    ) {
      return;
    }
    const interval = window.setInterval(() => router.refresh(), 2_500);
    return () => window.clearInterval(interval);
  }, [effectiveStatus, open, router]);

  const completionCount = [summary, refundPolicy, prohibitedUses].filter(
    (value) => value.trim().length > 0,
  ).length;
  const snapshotMeta = getSnapshotStatusMeta(effectiveStatus);
  const SnapshotIcon = snapshotMeta.icon;

  async function handleCollect() {
    setCollecting(true);
    setOptimisticSnapshot({ id: -1, status: "queued" });
    try {
      const result = await withTimeout(
        startProviderProfileCollection({ providerId: provider.id }),
        "采集任务入队超时，请稍后重试",
      );
      if (!result.success) {
        setOptimisticSnapshot(null);
        notifyError({
          title: result.errorTitle,
          description: result.message,
        });
        return;
      }

      setOptimisticSnapshot({
        id: result.data.snapshotId,
        status: result.data.status as ProviderProfileSnapshotStatus,
      });
      if (result.data.status === "pending") {
        notifyInfo({
          title: "已有待审核采集结果",
          description: provider.name,
        });
      } else {
        notifySuccess({
          title: "官网采集已排队",
          description: provider.name,
        });
      }
      router.refresh();
    } catch (error) {
      setOptimisticSnapshot(null);
      notifyError({
        title: "官网采集启动失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setCollecting(false);
    }
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      const result = await withTimeout(
        saveProviderProfile({
          providerId: provider.id,
          summary,
          summarySourceUrl,
          refundPolicy,
          refundPolicySourceUrl,
          prohibitedUses,
          prohibitedUsesSourceUrl,
          markVerified,
        }),
        "供应商档案保存超时，请稍后重试",
      );
      if (!result.success) {
        notifyError({
          title: result.errorTitle,
          description: result.message,
        });
        return;
      }

      notifySuccess({
        title: "供应商档案已保存",
        description: describeAdminResult([
          provider.name,
          markVerified ? "已标记核验" : "未标记核验",
        ]),
      });
      setSavedProfile(profileForm);
      router.refresh();
    } catch (error) {
      notifyError({
        title: "供应商档案保存失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  function handleCandidateApplied(input: {
    summary: string;
    refundPolicy: string;
    prohibitedUses: string;
  }) {
    const nextProfile = {
      ...profileForm,
      summary: input.summary.trim() || profileForm.summary,
      summarySourceUrl: input.summary.trim()
        ? (visibleSnapshot?.summarySourceUrl ?? "")
        : profileForm.summarySourceUrl,
      refundPolicy: input.refundPolicy.trim() || profileForm.refundPolicy,
      refundPolicySourceUrl: input.refundPolicy.trim()
        ? (visibleSnapshot?.refundPolicySourceUrl ?? "")
        : profileForm.refundPolicySourceUrl,
      prohibitedUses: input.prohibitedUses.trim() || profileForm.prohibitedUses,
      prohibitedUsesSourceUrl: input.prohibitedUses.trim()
        ? (visibleSnapshot?.prohibitedUsesSourceUrl ?? "")
        : profileForm.prohibitedUsesSourceUrl,
      markVerified: true,
    };
    setSummary(nextProfile.summary);
    setSummarySourceUrl(nextProfile.summarySourceUrl);
    setRefundPolicy(nextProfile.refundPolicy);
    setRefundPolicySourceUrl(nextProfile.refundPolicySourceUrl);
    setProhibitedUses(nextProfile.prohibitedUses);
    setProhibitedUsesSourceUrl(nextProfile.prohibitedUsesSourceUrl);
    setMarkVerified(true);
    setSavedProfile(nextProfile);
  }

  function handleCandidateStatusChange(status: "applied" | "rejected") {
    if (!visibleSnapshot) return;
    setCandidateDirty(false);
    setOptimisticSnapshot({ id: visibleSnapshot.id, status });
  }

  function handleSheetOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (exitBusy) return;
    if (hasUnsavedChanges) {
      setPendingExit({ href: null });
      return;
    }
    onOpenChange(false);
  }

  function discardChangesAndExit() {
    const href = pendingExit?.href;
    setPendingExit(null);
    if (href) {
      router.push(href);
      return;
    }
    onOpenChange(false);
  }

  async function handleDeletePromo(promo: ProviderPromoCodeData) {
    setDeletingPromoId(promo.id);
    try {
      const result = await withTimeout(
        deleteProviderPromoCode({ id: promo.id }),
        "优惠码删除超时，请稍后重试",
      );
      if (!result.success) {
        notifyError({
          title: result.errorTitle,
          description: result.message,
        });
        return;
      }

      notifySuccess({
        title: "优惠码已删除",
        description: promo.code,
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "优惠码删除失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setDeletingPromoId(null);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle>{provider.name}</SheetTitle>
              <Badge variant={completionCount === 3 ? "default" : "secondary"}>
                档案 {completionCount}/3
              </Badge>
              {provider.profileVerifiedAt ? (
                <Badge variant="outline">已核验</Badge>
              ) : null}
            </div>
            <SheetDescription className="flex min-w-0 items-center gap-2">
              <a
                href={getOfficialHref(provider.officialUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1 hover:text-foreground"
              >
                <span className="truncate">{provider.officialUrl}</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
              <span>·</span>
              <span>ID {provider.id}</span>
            </SheetDescription>
          </SheetHeader>

          <section className="mt-6 border-t pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">官网采集</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant={snapshotMeta.variant}>
                    <SnapshotIcon
                      className={`mr-1 size-3 ${effectiveStatus === "running" ? "animate-spin" : ""}`}
                    />
                    {snapshotMeta.label}
                  </Badge>
                  {visibleSnapshot ? (
                    <span className="text-xs text-muted-foreground">
                      {formatDate(
                        visibleSnapshot.updatedAt ?? visibleSnapshot.createdAt,
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
              <Button
                variant="outline"
                disabled={
                  collecting ||
                  effectiveStatus === "queued" ||
                  effectiveStatus === "running" ||
                  effectiveStatus === "pending"
                }
                onClick={handleCollect}
              >
                <RefreshCw
                  className={`size-4 ${collecting ? "animate-spin" : ""}`}
                />
                {effectiveStatus === "failed" ? "重新采集" : "采集官网"}
              </Button>
            </div>

            {effectiveStatus === "failed" && visibleSnapshot?.error ? (
              <p className="mt-4 break-words rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {visibleSnapshot.error}
              </p>
            ) : null}

            {effectiveStatus === "pending" && visibleSnapshot?.error ? (
              <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                <p className="flex items-center gap-2 font-medium">
                  <TriangleAlert className="size-4 shrink-0" />
                  采集结果不完整
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words leading-6">
                  {visibleSnapshot.error}
                </p>
              </div>
            ) : null}

            {effectiveStatus === "pending" && visibleSnapshot ? (
              <ProviderCandidateReview
                key={visibleSnapshot.id}
                snapshot={visibleSnapshot}
                providerName={provider.name}
                applyBlocked={profileDirty || savingProfile}
                onApplied={handleCandidateApplied}
                onBusyChange={setCandidateReviewing}
                onDirtyChange={setCandidateDirty}
                onStatusChange={handleCandidateStatusChange}
              />
            ) : null}
          </section>

          <section className="mt-6 border-t pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">正式档案</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  最近更新 {formatDate(provider.profileUpdatedAt)} · 最近核验{" "}
                  {formatDate(provider.profileVerifiedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="provider-profile-verified"
                  checked={markVerified}
                  disabled={candidateReviewing}
                  onCheckedChange={setMarkVerified}
                />
                <Label htmlFor="provider-profile-verified">已核验</Label>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="provider-profile-summary">供应商介绍</Label>
                <Textarea
                  id="provider-profile-summary"
                  className="min-h-28"
                  value={summary}
                  disabled={candidateReviewing}
                  onChange={(event) => setSummary(event.target.value)}
                />
                <Input
                  aria-label="供应商介绍来源 URL"
                  value={summarySourceUrl}
                  disabled={candidateReviewing}
                  onChange={(event) => setSummarySourceUrl(event.target.value)}
                  placeholder="介绍来源 URL"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-profile-refund">退款政策</Label>
                <Textarea
                  id="provider-profile-refund"
                  className="min-h-40"
                  value={refundPolicy}
                  disabled={candidateReviewing}
                  onChange={(event) => setRefundPolicy(event.target.value)}
                />
                <Input
                  aria-label="退款政策来源 URL"
                  value={refundPolicySourceUrl}
                  disabled={candidateReviewing}
                  onChange={(event) =>
                    setRefundPolicySourceUrl(event.target.value)
                  }
                  placeholder="退款政策来源 URL"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-profile-prohibited">禁止事项</Label>
                <Textarea
                  id="provider-profile-prohibited"
                  className="min-h-40"
                  value={prohibitedUses}
                  disabled={candidateReviewing}
                  onChange={(event) => setProhibitedUses(event.target.value)}
                />
                <Input
                  aria-label="禁止事项来源 URL"
                  value={prohibitedUsesSourceUrl}
                  disabled={candidateReviewing}
                  onChange={(event) =>
                    setProhibitedUsesSourceUrl(event.target.value)
                  }
                  placeholder="禁止事项来源 URL"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  disabled={savingProfile || candidateReviewing}
                  onClick={handleSaveProfile}
                >
                  <Save className="size-4" />
                  {savingProfile ? "保存中..." : "保存档案"}
                </Button>
              </div>
            </div>
          </section>

          <section className="mt-6 border-t pb-8 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">优惠码</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  共 {provider.promoCodes.length} 条
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingPromo(null);
                  setPromoDialogOpen(true);
                }}
              >
                <Plus className="size-4" />
                新增优惠码
              </Button>
            </div>

            {provider.promoCodes.length === 0 ? (
              <div className="mt-5 flex min-h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                暂无优惠码
              </div>
            ) : (
              <div className="mt-5 divide-y border-y">
                {provider.promoCodes.map((promo) => {
                  const promoStatus = getPromoStatus(promo);
                  return (
                    <div key={promo.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="break-all text-sm font-semibold">
                              {promo.code}
                            </code>
                            <Badge variant={promoStatus.variant}>
                              {promoStatus.label}
                            </Badge>
                            {promo.isDefault ? (
                              <Badge variant="outline">默认</Badge>
                            ) : null}
                          </div>
                          {promo.discountText || promo.description ? (
                            <p className="text-sm">
                              {[promo.discountText, promo.description]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          ) : null}
                          {promo.terms ? (
                            <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                              {promo.terms}
                            </p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            {formatDate(promo.startsAt)} 至{" "}
                            {formatDate(promo.endsAt)}
                          </p>
                          <SourceLink url={promo.sourceUrl} />
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-10"
                            aria-label={`编辑优惠码 ${promo.code}`}
                            title="编辑优惠码"
                            onClick={() => {
                              setEditingPromo(promo);
                              setPromoDialogOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="destructive"
                                size="icon"
                                className="size-10"
                                disabled={deletingPromoId !== null}
                                aria-label={`删除优惠码 ${promo.code}`}
                                title="删除优惠码"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  删除优惠码？
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  将永久删除优惠码 {promo.code}。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction
                                  disabled={deletingPromoId === promo.id}
                                  onClick={() => handleDeletePromo(promo)}
                                >
                                  {deletingPromoId === promo.id
                                    ? "删除中..."
                                    : "确认删除"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </SheetContent>
      </Sheet>

      {promoDialogOpen ? (
        <PromoCodeDialog
          providerId={provider.id}
          promo={editingPromo}
          open
          onOpenChange={setPromoDialogOpen}
          onBusyChange={setPromoSaving}
          onDirtyChange={setPromoDirty}
          onSaved={() => router.refresh()}
        />
      ) : null}

      <AlertDialog
        open={pendingExit !== null}
        onOpenChange={(nextOpen) => !nextOpen && setPendingExit(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
            <AlertDialogDescription>
              供应商档案、采集候选或优惠码中有未保存内容，继续后这些修改将丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={discardChangesAndExit}
            >
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
