"use client";

import { useOptimistic, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  Eye,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteProviderMonitorAction,
  previewProviderMonitorAction,
  reviewProviderOfferCandidateAction,
  reviewProviderOfferCandidatesAction,
  runProviderMonitorNowAction,
  saveProviderMonitorAction,
} from "@/features/cms/actions/provider-monitors";
import { useAdminMutation } from "@/features/cms/hooks/use-admin-mutation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  getProviderMonitorCheckHistory,
  getProviderMonitorList,
  getProviderMonitorRunHistory,
  getProviderOfferCandidateList,
  getProviderOptionsForMonitoring,
} from "@/server/offers/provider-monitor";
import { formatServerOfferAmount } from "@fwqgo/core/server-offer-price";

type Monitor = Awaited<ReturnType<typeof getProviderMonitorList>>[number];
type Provider = Awaited<
  ReturnType<typeof getProviderOptionsForMonitoring>
>[number];
type CheckRow = Awaited<
  ReturnType<typeof getProviderMonitorCheckHistory>
>[number];
type RunRow = Awaited<ReturnType<typeof getProviderMonitorRunHistory>>[number];
type CandidateRow = Awaited<
  ReturnType<typeof getProviderOfferCandidateList>
>[number];
type MonitorAdapter = "json" | "html" | "whmcs";

function formatCheckPrice(check: CheckRow) {
  if (
    check.priceAmount === null ||
    check.priceAmount === undefined ||
    String(check.priceAmount).trim() === ""
  ) {
    return "-";
  }

  return (
    formatServerOfferAmount({
      amount: check.priceAmount,
      currency: check.currency,
    }) ?? "待确认"
  );
}

const defaultJsonConfig = {
  itemsPath: "data",
  externalIdField: "id",
  statusField: "status",
  titleField: "name",
  priceField: "price",
  currencyField: "currency",
  billingCycleField: "billingCycle",
  purchaseUrlField: "purchaseUrl",
  requiredSpecCount: 2,
  defaults: {},
  statusMap: {},
  headers: {},
};

const defaultHtmlConfig = {
  itemSelector: ".product",
  fields: {
    externalProductId: { selector: "", attribute: "data-product-id" },
    title: { selector: ".product-name" },
    price: { selector: ".price" },
    purchaseUrl: { selector: "a[href]", attribute: "href" },
    cpu: { selector: ".cpu" },
    memory: { selector: ".memory" },
    storage: { selector: ".storage" },
  },
  requiredSpecCount: 2,
  defaults: {},
  statusMap: {},
  headers: {},
};

function getDefaultConfigText(adapter: MonitorAdapter) {
  return JSON.stringify(
    adapter === "json" ? defaultJsonConfig : defaultHtmlConfig,
    null,
    2,
  );
}

const adapterLabels: Record<string, string> = {
  json: "JSON 接口",
  html: "HTML 页面",
  whmcs: "WHMCS 页面",
};

const purposeLabels: Record<string, string> = {
  catalog: "常规目录",
  promotion: "促销套餐",
  stock: "库存补充",
};

const monitorStatusLabels: Record<string, string> = {
  idle: "未运行",
  running: "执行中",
  succeeded: "成功",
  failed: "失败",
};

const billingCycleLabels: Record<string, string> = {
  monthly: "月付",
  quarterly: "季付",
  semiannual: "半年付",
  yearly: "年付",
  biennial: "两年付",
  triennial: "三年付",
};

const tableCheckboxClassName =
  "relative flex size-11 items-center justify-center rounded-md border-0 shadow-none before:absolute before:left-1/2 before:top-1/2 before:size-4 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-sm before:border before:border-primary data-[state=checked]:bg-transparent data-[state=indeterminate]:bg-transparent data-[state=checked]:before:bg-primary data-[state=indeterminate]:before:bg-primary [&_svg]:relative [&_svg]:z-10";

const providerCandidateBatchMutationKey = "provider-candidates:batch-review";

function getProviderMonitorMutationKey(monitorId: number) {
  return `provider-monitor:${monitorId}`;
}

function getProviderCandidateMutationKey(candidateId: number) {
  return `provider-candidate:${candidateId}`;
}

function formatDate(value: Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function getFormDataText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getCandidateData(row: CandidateRow) {
  return row.normalizedData as {
    title?: string;
    cpu?: string | null;
    memory?: string | null;
    storage?: string | null;
    region?: string | null;
    purchaseUrl?: string;
    prices?: Array<{
      amount?: string;
      currency?: string;
      billingCycle?: string;
    }>;
  };
}

function getProviderDomain(officialUrl: string) {
  try {
    return new URL(officialUrl).hostname.replace(/^www\./i, "");
  } catch {
    return officialUrl;
  }
}

function matchesProvider(provider: Provider, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  return [
    provider.name,
    provider.slug,
    provider.aliases,
    provider.officialUrl,
    getProviderDomain(provider.officialUrl),
  ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
}

function MonitorFormDialog({
  monitor,
  providers,
  open,
  onOpenChange,
}: {
  monitor: Monitor | null;
  providers: Provider[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate, isPending } = useAdminMutation();
  const formMutationLockRef = useRef(false);
  const mutationKeyPrefix = `provider-monitor-form:${monitor?.id ?? "new"}`;
  const saveMutationKey = `${mutationKeyPrefix}:save`;
  const previewMutationKey = `${mutationKeyPrefix}:preview`;
  const savePending = isPending(saveMutationKey);
  const previewPending = isPending(previewMutationKey);
  const formPending = savePending || previewPending;
  const [enabled, setEnabled] = useState(monitor?.enabled ?? false);
  const [autoPublish, setAutoPublish] = useState(monitor?.autoPublish ?? false);
  const [adapter, setAdapter] = useState<MonitorAdapter>(
    (monitor?.adapter as MonitorAdapter | undefined) ?? "json",
  );
  const [providerId, setProviderId] = useState(
    String(monitor?.providerId ?? ""),
  );
  const [providerQuery, setProviderQuery] = useState("");
  const [configText, setConfigText] = useState(
    monitor?.config
      ? JSON.stringify(monitor.config, null, 2)
      : getDefaultConfigText("json"),
  );
  const [configDrafts, setConfigDrafts] = useState<
    Partial<Record<MonitorAdapter, string>>
  >({});
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof previewProviderMonitorAction>
  > | null>(null);
  const matchingProviders = providers.filter((provider) =>
    matchesProvider(provider, providerQuery),
  );
  const selectedProvider = providers.find(
    (provider) => String(provider.id) === providerId,
  );
  const visibleProviders =
    selectedProvider &&
    !matchingProviders.some((provider) => provider.id === selectedProvider.id)
      ? [selectedProvider, ...matchingProviders]
      : matchingProviders;

  function actionInput(formData: FormData) {
    return {
      id: monitor?.id,
      providerId: Number(formData.get("providerId")),
      name: getFormDataText(formData, "name"),
      adapter,
      purpose: getFormDataText(formData, "purpose") as
        | "catalog"
        | "promotion"
        | "stock",
      endpointUrl: getFormDataText(formData, "endpointUrl"),
      configText,
      enabled,
      autoPublish,
      missingThreshold: Number(formData.get("missingThreshold")),
      intervalMinutes: Number(formData.get("intervalMinutes")),
      timeoutSeconds: Number(formData.get("timeoutSeconds")),
    };
  }

  function submit(formData: FormData) {
    if (formMutationLockRef.current) return;
    formMutationLockRef.current = true;
    void mutate({
      key: saveMutationKey,
      action: () => saveProviderMonitorAction(actionInput(formData)),
      pendingMessage: "正在保存供应商采集源...",
      successMessage: (result) => ({
        title: result.message ?? "供应商采集源已保存",
        description: enabled
          ? "配置已启用，后台会按执行间隔采集供应商套餐。"
          : "配置已保存为停用状态。",
      }),
      errorTitle: "保存供应商采集源失败",
      errorSuggestion: "请检查配置与网络状态后重试。",
      onSuccess: () => onOpenChange(false),
    }).finally(() => {
      formMutationLockRef.current = false;
    });
  }

  function runPreview(formData: FormData) {
    if (formMutationLockRef.current) return;
    formMutationLockRef.current = true;
    void mutate({
      key: previewMutationKey,
      action: async () => {
        const result = await previewProviderMonitorAction(actionInput(formData));
        setPreview(result);
        return result;
      },
      pendingMessage: "正在检测供应商页面...",
      successMessage: (result) => ({
        title: result.message ?? "采集预览完成",
        description: "预览不会写入候选或套餐数据。",
      }),
      errorTitle: "采集预览失败",
      errorSuggestion: "请检查供应商网址、字段映射与登录状态后重试。",
      refresh: false,
    }).finally(() => {
      formMutationLockRef.current = false;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {monitor ? "编辑供应商采集源" : "新增供应商采集源"}
          </DialogTitle>
          <DialogDescription>
            从供应商 JSON、HTML 或 WHMCS
            产品页采集具体配置、价格和独立购买链接。
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          {monitor ? (
            <input type="hidden" name="providerId" value={providerId} />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="monitor-provider">厂商</Label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="search"
                  value={providerQuery}
                  onChange={(event) => setProviderQuery(event.target.value)}
                  placeholder="搜索名称、域名或别名"
                  aria-label="搜索供应商"
                  className="min-h-11 pl-9"
                  disabled={Boolean(monitor)}
                />
              </div>
              <Select
                name={monitor ? undefined : "providerId"}
                value={providerId}
                disabled={Boolean(monitor)}
                onValueChange={(value) => {
                  setProviderId(value);
                  setProviderQuery("");
                }}
              >
                <SelectTrigger id="monitor-provider" className="min-h-11">
                  <SelectValue placeholder="选择厂商" />
                </SelectTrigger>
                <SelectContent>
                  {visibleProviders.map((provider) => (
                    <SelectItem key={provider.id} value={String(provider.id)}>
                      {provider.name} ·{" "}
                      {getProviderDomain(provider.officialUrl)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {providerQuery.trim()
                  ? `匹配 ${matchingProviders.length} / ${providers.length} 个供应商`
                  : `共 ${providers.length} 个供应商`}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="monitor-name">采集源名称</Label>
              <Input
                id="monitor-name"
                name="name"
                defaultValue={monitor?.name ?? "官网套餐目录"}
                required
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monitor-missing-threshold">连续缺失次数</Label>
              <Input
                id="monitor-missing-threshold"
                name="missingThreshold"
                type="number"
                min="1"
                max="20"
                defaultValue={monitor?.missingThreshold ?? 3}
                required
                className="min-h-11"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="monitor-adapter">网页类型</Label>
              <Select
                value={adapter}
                onValueChange={(value) => {
                  const nextAdapter = value as MonitorAdapter;
                  setConfigDrafts((current) => ({
                    ...current,
                    [adapter]: configText,
                  }));
                  setAdapter(nextAdapter);
                  setConfigText(
                    configDrafts[nextAdapter] ??
                      getDefaultConfigText(nextAdapter),
                  );
                  setPreview(null);
                }}
              >
                <SelectTrigger id="monitor-adapter" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON 接口</SelectItem>
                  <SelectItem value="html">HTML 产品页</SelectItem>
                  <SelectItem value="whmcs">WHMCS 产品页</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="monitor-purpose">采集目的</Label>
              <Select
                name="purpose"
                defaultValue={monitor?.purpose ?? "catalog"}
              >
                <SelectTrigger id="monitor-purpose" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="catalog">常规目录</SelectItem>
                  <SelectItem value="promotion">促销套餐</SelectItem>
                  <SelectItem value="stock">库存补充</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="monitor-endpoint">供应商网址</Label>
            <Input
              id="monitor-endpoint"
              name="endpointUrl"
              type="url"
              defaultValue={monitor?.endpointUrl ?? ""}
              placeholder="https://provider.example/products"
              required
              className="min-h-11 font-mono text-sm"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="monitor-interval">执行间隔（分钟）</Label>
              <Input
                id="monitor-interval"
                name="intervalMinutes"
                type="number"
                min="1"
                max="10080"
                defaultValue={monitor?.intervalMinutes ?? 30}
                required
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monitor-timeout">请求超时（秒）</Label>
              <Input
                id="monitor-timeout"
                name="timeoutSeconds"
                type="number"
                min="1"
                max="300"
                defaultValue={monitor?.timeoutSeconds ?? 30}
                required
                className="min-h-11"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="monitor-config">字段映射 JSON</Label>
            <Textarea
              id="monitor-config"
              name="configText"
              value={configText}
              onChange={(event) => {
                setConfigText(event.target.value);
                setPreview(null);
              }}
              className="min-h-72 font-mono text-xs leading-5"
              spellCheck={false}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              JSON 使用字段路径；HTML/WHMCS 使用 itemSelector 和 CSS
              选择器。每个套餐必须有稳定产品 ID、价格、配置和独立购买链接。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-16 items-center justify-between gap-4 rounded-md border border-border/70 px-3">
              <span>
                <span className="block text-sm font-medium">启用定时采集</span>
                <span className="block text-xs text-muted-foreground">
                  启用后立即入队并按间隔执行。
                </span>
              </span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </label>
            <label className="flex min-h-16 items-center justify-between gap-4 rounded-md border border-border/70 px-3">
              <span>
                <span className="block text-sm font-medium">
                  新套餐自动发布
                </span>
                <span className="block text-xs text-muted-foreground">
                  关闭时先进入待审核列表。
                </span>
              </span>
              <Switch checked={autoPublish} onCheckedChange={setAutoPublish} />
            </label>
          </div>
          {preview ? (
            <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-xs">
              {preview.success ? (
                <div className="space-y-2">
                  <p className="font-medium text-foreground">
                    HTTP {preview.data.httpStatus} · 识别 {preview.data.total}{" "}
                    个套餐 · 展示前 {preview.data.items.length} 个
                  </p>
                  {preview.data.items.map((item, index) => (
                    <div
                      key={`${item.candidate.externalProductId}-${index}`}
                      className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2"
                    >
                      <Badge
                        variant={item.quality.valid ? "outline" : "destructive"}
                      >
                        {item.quality.valid ? "有效" : "需调整映射"}
                      </Badge>
                      <span className="font-medium">
                        {item.candidate.title || "未识别标题"}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {item.candidate.externalProductId || "无产品 ID"}
                      </span>
                      {item.candidate.prices.map((price, priceIndex) => (
                        <span
                          key={`${price.billingCycle}-${price.currency}-${priceIndex}`}
                          className="text-muted-foreground"
                        >
                          {billingCycleLabels[price.billingCycle] ??
                            price.billingCycle}
                          ：{price.currency} {price.amount}
                        </span>
                      ))}
                      {!item.quality.valid ? (
                        <span className="text-destructive">
                          {item.quality.reasons.join("；")}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-destructive">{preview.message}</p>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={formPending}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="outline"
              formAction={runPreview}
              disabled={formPending || providers.length === 0 || !providerId}
            >
              <Eye className="size-4" />
              {previewPending ? "检测中..." : "预览采集"}
            </Button>
            <Button
              type="submit"
              disabled={formPending || providers.length === 0 || !providerId}
            >
              {savePending ? "保存中..." : "保存配置"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProviderMonitorManager({
  monitors,
  providers,
  runs,
  candidates,
  checks,
}: {
  monitors: Monitor[];
  providers: Provider[];
  runs: RunRow[];
  candidates: CandidateRow[];
  checks: CheckRow[];
}) {
  const [editing, setEditing] = useState<Monitor | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [deleting, setDeleting] = useState<Monitor | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<number[]>(
    [],
  );
  const [batchDecision, setBatchDecision] = useState<
    "accept" | "reject" | null
  >(null);
  const candidateReviewLockRef = useRef(false);
  const [visibleMonitors, removeOptimisticMonitor] = useOptimistic(
    monitors,
    (current, monitorId: number) =>
      current.filter((monitor) => monitor.id !== monitorId),
  );
  const [visibleCandidates, removeOptimisticCandidates] = useOptimistic(
    candidates,
    (current, candidateIds: number[]) => {
      const removedIds = new Set(candidateIds);
      return current.filter((candidate) => !removedIds.has(candidate.id));
    },
  );
  const { mutate, isPending } = useAdminMutation();
  const visibleCandidateIdSet = new Set(
    visibleCandidates.map((candidate) => candidate.id),
  );
  const visibleSelectedCandidateIds = selectedCandidateIds.filter(
    (candidateId) => visibleCandidateIdSet.has(candidateId),
  );
  const selectedCandidateIdSet = new Set(visibleSelectedCandidateIds);
  const allCandidatesSelected =
    visibleCandidates.length > 0 &&
    visibleCandidates.every((candidate) =>
      selectedCandidateIdSet.has(candidate.id),
    );
  const optimisticallyReviewedCandidateCount = Math.max(
    0,
    candidates.length - visibleCandidates.length,
  );
  const totalPendingCandidates = Math.max(
    visibleCandidates.length,
    Math.max(
      0,
      monitors.reduce(
        (total, monitor) => total + monitor.pendingCandidateCount,
        0,
      ) - optimisticallyReviewedCandidateCount,
    ),
  );
  const batchReviewPending = isPending(providerCandidateBatchMutationKey);
  const individualCandidateReviewPending = candidates.some((candidate) =>
    isPending(getProviderCandidateMutationKey(candidate.id)),
  );
  const deletingPending = deleting
    ? isPending(getProviderMonitorMutationKey(deleting.id))
    : false;

  function openEditor(monitor: Monitor | null) {
    setEditing(monitor);
    setEditorVersion((current) => current + 1);
    setDialogOpen(true);
  }

  function runNow(monitor: Monitor) {
    void mutate({
      key: getProviderMonitorMutationKey(monitor.id),
      action: () => runProviderMonitorNowAction(monitor.id),
      pendingMessage: {
        title: "正在加入采集队列...",
        description: `${monitor.providerName} · ${monitor.name}`,
      },
      successMessage: (result) => ({
        title: result.message ?? "检测任务已排队",
        description: `${monitor.providerName} · ${monitor.name}`,
      }),
      errorTitle: "启动供应商采集失败",
      errorSuggestion: "请确认采集源仍然存在且已启用，然后重新执行。",
    });
  }

  function remove(monitor: Monitor) {
    void mutate({
      key: getProviderMonitorMutationKey(monitor.id),
      action: () => deleteProviderMonitorAction(monitor.id),
      pendingMessage: {
        title: "正在删除采集源...",
        description: `${monitor.providerName} · ${monitor.name}`,
      },
      successMessage: (result) => result.message ?? "供应商采集源已删除",
      errorTitle: "删除供应商采集源失败",
      errorSuggestion: "正在运行的采集需要等待本次执行结束后再删除。",
      optimistic: {
        apply: () => removeOptimisticMonitor(monitor.id),
      },
      onSuccess: () => setDeleting(null),
    });
  }

  function reviewCandidate(
    candidate: CandidateRow,
    decision: "accept" | "reject",
  ) {
    if (candidateReviewLockRef.current) return;
    candidateReviewLockRef.current = true;
    void mutate({
      key: getProviderCandidateMutationKey(candidate.id),
      action: () =>
        reviewProviderOfferCandidateAction({
          candidateId: candidate.id,
          decision,
        }),
      pendingMessage: {
        title:
          decision === "accept" ? "正在接受候选套餐..." : "正在拒绝候选套餐...",
        description: `${candidate.providerName} · ${candidate.externalProductId}`,
      },
      successMessage: (result) => ({
        title: result.message ?? "候选状态已更新",
        description: `${candidate.providerName} · ${candidate.externalProductId}`,
      }),
      errorTitle: decision === "accept" ? "接受候选失败" : "拒绝候选失败",
      errorSuggestion: "请刷新页面确认候选状态后重试。",
      optimistic: {
        apply: () => removeOptimisticCandidates([candidate.id]),
      },
      onSuccess: () =>
        setSelectedCandidateIds((current) =>
          current.filter((candidateId) => candidateId !== candidate.id),
        ),
    }).finally(() => {
      candidateReviewLockRef.current = false;
    });
  }

  function toggleCandidate(candidateId: number, checked: boolean) {
    setSelectedCandidateIds((current) => {
      if (checked)
        return current.includes(candidateId)
          ? current
          : [...current, candidateId];
      return current.filter((id) => id !== candidateId);
    });
  }

  function toggleAllCandidates(checked: boolean) {
    setSelectedCandidateIds(
      checked ? visibleCandidates.map((candidate) => candidate.id) : [],
    );
  }

  function reviewSelectedCandidates() {
    if (
      !batchDecision ||
      visibleSelectedCandidateIds.length === 0 ||
      candidateReviewLockRef.current
    )
      return;
    candidateReviewLockRef.current = true;
    const decision = batchDecision;
    const candidateIds = visibleSelectedCandidateIds;
    void mutate({
      key: providerCandidateBatchMutationKey,
      action: () =>
        reviewProviderOfferCandidatesAction({
          candidateIds,
          decision,
          reason: decision === "reject" ? "批量拒绝" : undefined,
        }),
      pendingMessage:
        decision === "accept"
          ? `正在批量接受 ${candidateIds.length} 个候选套餐...`
          : `正在批量拒绝 ${candidateIds.length} 个候选套餐...`,
      successMessage: (result) => ({
        title: result.message ?? "批量审核完成",
        description: "选中的候选套餐已完成审核，列表已同步最新状态。",
      }),
      errorTitle:
        decision === "accept" ? "批量接受候选失败" : "批量拒绝候选失败",
      errorSuggestion: "请刷新页面确认候选状态后重试。",
      optimistic: {
        apply: () => removeOptimisticCandidates(candidateIds),
      },
      onSuccess: () => {
        setSelectedCandidateIds([]);
        setBatchDecision(null);
      },
    }).finally(() => {
      candidateReviewLockRef.current = false;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => openEditor(null)}>
          <Plus className="size-4" />
          新增采集源
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead>供应商 / 采集源</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>套餐 / 待审核</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>执行时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleMonitors.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  还没有供应商采集源。
                </TableCell>
              </TableRow>
            ) : null}
            {visibleMonitors.map((monitor) => {
              const monitorPending = isPending(
                getProviderMonitorMutationKey(monitor.id),
              );
              return (
                <TableRow key={monitor.id} className="align-top">
                  <TableCell className="min-w-48">
                    <p className="font-medium text-foreground">
                      {monitor.providerName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {monitor.name}
                    </p>
                    <Badge
                      variant={monitor.enabled ? "secondary" : "outline"}
                      className="mt-2"
                    >
                      {monitor.enabled
                        ? `每 ${monitor.intervalMinutes} 分钟`
                        : "已停用"}
                    </Badge>
                    <Badge variant="outline" className="ml-2 mt-2">
                      {purposeLabels[monitor.purpose] ?? monitor.purpose}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-80">
                    <p
                      className="truncate font-mono text-xs"
                      title={monitor.endpointUrl}
                    >
                      {monitor.endpointUrl}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      超时 {monitor.timeoutSeconds} 秒 ·{" "}
                      {adapterLabels[monitor.adapter] ?? monitor.adapter}
                    </p>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <p>{monitor.mappedOfferCount} 个套餐</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {monitor.pendingCandidateCount} 个待审核
                    </p>
                  </TableCell>
                  <TableCell className="min-w-56">
                    <Badge
                      variant={
                        monitor.lastStatus === "failed"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {monitorStatusLabels[monitor.lastStatus] ??
                        monitor.lastStatus}
                    </Badge>
                    {monitor.lastError ? (
                      <p
                        className="mt-2 line-clamp-3 text-xs leading-5 text-destructive"
                        title={monitor.lastError}
                      >
                        {monitor.lastError}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    <p>上次：{formatDate(monitor.lastRunAt)}</p>
                    <p className="mt-1">
                      下次：{formatDate(monitor.nextRunAt)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        title="立即采集"
                        aria-label={`立即采集 ${monitor.name}`}
                        disabled={monitorPending || !monitor.enabled}
                        onClick={() => runNow(monitor)}
                      >
                        {monitorPending ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <Play className="size-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        title="编辑采集源"
                        aria-label={`编辑 ${monitor.name}`}
                        disabled={monitorPending}
                        onClick={() => openEditor(monitor)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        title="删除采集源"
                        aria-label={`删除 ${monitor.name}`}
                        disabled={monitorPending}
                        onClick={() => setDeleting(monitor)}
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

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              待审核套餐
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              新识别套餐默认不会发布；确认配置、价格和购买链接后再接受。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {visibleSelectedCandidateIds.length > 0 ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    batchReviewPending || individualCandidateReviewPending
                  }
                  onClick={() => setBatchDecision("reject")}
                >
                  <X className="size-4 text-destructive" />
                  批量拒绝（{visibleSelectedCandidateIds.length}）
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    batchReviewPending || individualCandidateReviewPending
                  }
                  onClick={() => setBatchDecision("accept")}
                >
                  <CheckCheck className="size-4" />
                  批量接受（{visibleSelectedCandidateIds.length}）
                </Button>
              </>
            ) : null}
            <Badge
              variant={visibleCandidates.length > 0 ? "secondary" : "outline"}
            >
              {visibleCandidates.length < totalPendingCandidates
                ? `显示 ${visibleCandidates.length} / 共 ${totalPendingCandidates} 个待处理`
                : `${totalPendingCandidates} 个待处理`}
            </Badge>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 p-0">
                  <Checkbox
                    className={tableCheckboxClassName}
                    checked={
                      allCandidatesSelected
                        ? true
                        : visibleSelectedCandidateIds.length > 0
                          ? "indeterminate"
                          : false
                    }
                    disabled={
                      batchReviewPending ||
                      individualCandidateReviewPending ||
                      visibleCandidates.length === 0
                    }
                    onCheckedChange={(checked) =>
                      toggleAllCandidates(checked === true)
                    }
                    aria-label="全选待审核套餐"
                  />
                </TableHead>
                <TableHead>供应商 / 产品 ID</TableHead>
                <TableHead>套餐配置</TableHead>
                <TableHead>价格</TableHead>
                <TableHead>购买链接</TableHead>
                <TableHead>发现时间</TableHead>
                <TableHead className="text-right">审核</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleCandidates.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    当前没有待审核套餐。
                  </TableCell>
                </TableRow>
              ) : null}
              {visibleCandidates.map((candidate) => {
                const data = getCandidateData(candidate);
                const prices = data.prices ?? [];
                const candidatePending = isPending(
                  getProviderCandidateMutationKey(candidate.id),
                );
                return (
                  <TableRow key={candidate.id} className="align-top">
                    <TableCell className="w-12 p-0 align-top">
                      <Checkbox
                        className={tableCheckboxClassName}
                        checked={selectedCandidateIdSet.has(candidate.id)}
                        disabled={
                          candidatePending ||
                          batchReviewPending ||
                          individualCandidateReviewPending
                        }
                        onCheckedChange={(checked) =>
                          toggleCandidate(candidate.id, checked === true)
                        }
                        aria-label={`选择 ${data.title ?? candidate.externalProductId}`}
                      />
                    </TableCell>
                    <TableCell className="min-w-48">
                      <p className="font-medium">{candidate.providerName}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {candidate.externalProductId}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {candidate.monitorName}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-64">
                      <p className="font-medium">
                        {data.title ?? "未命名套餐"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {[data.cpu, data.memory, data.storage, data.region]
                          .filter(Boolean)
                          .join(" · ") || "暂无配置摘要"}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {prices.length > 0
                        ? prices.map((price, priceIndex) => (
                            <p
                              key={`${price.billingCycle}-${price.currency}-${priceIndex}`}
                              className={priceIndex > 0 ? "mt-1" : undefined}
                            >
                              {billingCycleLabels[
                                price.billingCycle ?? "monthly"
                              ] ??
                                price.billingCycle ??
                                "月付"}
                              ：{price.currency ?? "USD"} {price.amount ?? "-"}
                            </p>
                          ))
                        : "-"}
                    </TableCell>
                    <TableCell className="max-w-72">
                      {data.purchaseUrl ? (
                        <a
                          href={data.purchaseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate font-mono text-xs text-primary underline-offset-4 hover:underline"
                          title={data.purchaseUrl}
                        >
                          {data.purchaseUrl}
                        </a>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(candidate.firstSeenAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          title="拒绝候选"
                          aria-label={`拒绝 ${data.title ?? candidate.externalProductId}`}
                          disabled={
                            candidatePending ||
                            batchReviewPending ||
                            individualCandidateReviewPending
                          }
                          onClick={() => reviewCandidate(candidate, "reject")}
                        >
                          <X className="size-4 text-destructive" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          title="接受并创建套餐"
                          aria-label={`接受 ${data.title ?? candidate.externalProductId}`}
                          disabled={
                            candidatePending ||
                            batchReviewPending ||
                            individualCandidateReviewPending
                          }
                          onClick={() => reviewCandidate(candidate, "accept")}
                        >
                          <Check className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <AlertDialog
          open={batchDecision !== null}
          onOpenChange={(open) => {
            if (!open && !batchReviewPending) setBatchDecision(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {batchDecision === "accept"
                  ? "批量接受候选套餐？"
                  : "批量拒绝候选套餐？"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {batchDecision === "accept"
                  ? `将处理选中的 ${visibleSelectedCandidateIds.length} 个套餐，并创建或更新前台套餐。`
                  : `将拒绝选中的 ${visibleSelectedCandidateIds.length} 个套餐，后续不会自动发布。`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={batchReviewPending}>
                取消
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={
                  batchReviewPending || individualCandidateReviewPending
                }
                onClick={reviewSelectedCandidates}
              >
                {batchReviewPending
                  ? "处理中..."
                  : batchDecision === "accept"
                    ? "确认接受"
                    : "确认拒绝"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            采集运行历史
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            每次抓取独立记录响应状态、入库结果、跳过原因数量和失败详情。
          </p>
        </div>
        <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
          <Table className="min-w-[940px]">
            <TableHeader>
              <TableRow>
                <TableHead>开始时间</TableHead>
                <TableHead>供应商 / 采集源</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>接收</TableHead>
                <TableHead>新增 / 待审核</TableHead>
                <TableHead>更新 / 未变化</TableHead>
                <TableHead>跳过 / 缺失</TableHead>
                <TableHead>错误</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    暂无采集运行记录。
                  </TableCell>
                </TableRow>
              ) : null}
              {runs.map((run) => (
                <TableRow key={run.id} className="align-top">
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDate(run.startedAt)}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{run.providerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {run.monitorName}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        run.status === "failed"
                          ? "destructive"
                          : run.status === "running"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {run.status === "succeeded"
                        ? "成功"
                        : run.status === "running"
                          ? "运行中"
                          : "失败"}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      HTTP {run.httpStatus ?? "-"}
                    </p>
                  </TableCell>
                  <TableCell className="tabular-nums">{run.received}</TableCell>
                  <TableCell className="tabular-nums">
                    {run.created} / {run.pending}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {run.updated} / {run.unchanged}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {run.skipped} / {run.missing}
                  </TableCell>
                  <TableCell className="max-w-72">
                    {run.errorDetail ? (
                      <p
                        className="line-clamp-3 text-xs leading-5 text-destructive"
                        title={run.errorDetail}
                      >
                        {run.errorTitle ? `${run.errorTitle}：` : ""}
                        {run.errorDetail}
                      </p>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            套餐级检查记录
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            保留已入库套餐的库存、价格与响应耗时，用于定位单个产品异常。
          </p>
        </div>
        <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>厂商 / 套餐</TableHead>
                <TableHead>库存</TableHead>
                <TableHead>价格</TableHead>
                <TableHead>耗时</TableHead>
                <TableHead>结果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    暂无检测记录。
                  </TableCell>
                </TableRow>
              ) : null}
              {checks.map((check) => (
                <TableRow key={check.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDate(check.checkedAt)}
                  </TableCell>
                  <TableCell className="max-w-80">
                    <p className="truncate text-sm font-medium">
                      {check.offerTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {check.providerName ?? "未知厂商"}
                    </p>
                  </TableCell>
                  <TableCell>
                    {check.available === null
                      ? "未知"
                      : check.available
                        ? "有货"
                        : "无货"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatCheckPrice(check)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {check.responseTimeMs === null
                      ? "-"
                      : `${check.responseTimeMs} ms`}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        check.status === "ok" ? "outline" : "destructive"
                      }
                    >
                      {check.status === "ok" ? "正常" : check.status}
                    </Badge>
                    {check.error ? (
                      <p
                        className="mt-1 max-w-72 truncate text-xs text-destructive"
                        title={check.error}
                      >
                        {check.error}
                      </p>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {dialogOpen ? (
        <MonitorFormDialog
          key={`${editing?.id ?? "new"}-${editorVersion}`}
          monitor={editing}
          providers={providers}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      ) : null}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !deletingPending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除供应商采集源？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `将删除“${deleting.providerName} · ${deleting.name}”及其运行历史和待审核候选，已有套餐不会被删除。`
                : "删除后无法恢复。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingPending || !deleting}
              onClick={(event) => {
                event.preventDefault();
                if (deleting) remove(deleting);
              }}
            >
              {deletingPending ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
