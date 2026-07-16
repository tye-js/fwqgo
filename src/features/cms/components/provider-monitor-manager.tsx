"use client";

import { useState, useTransition } from "react";
import { Check, Eye, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  deleteProviderMonitorAction,
  previewProviderMonitorAction,
  reviewProviderOfferCandidateAction,
  runProviderMonitorNowAction,
  saveProviderMonitorAction,
} from "@/features/cms/actions/provider-monitors";
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
  getProviderMonitorCheckHistory,
  getProviderMonitorList,
  getProviderMonitorRunHistory,
  getProviderOfferCandidateList,
  getProviderOptionsForMonitoring,
} from "@/server/offers/provider-monitor";

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

function getCandidateData(row: CandidateRow) {
  return row.normalizedData as {
    title?: string;
    cpu?: string | null;
    memory?: string | null;
    storage?: string | null;
    region?: string | null;
    purchaseUrl?: string;
    prices?: Array<{ amount?: string; currency?: string; billingCycle?: string }>;
  };
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(monitor?.enabled ?? false);
  const [autoPublish, setAutoPublish] = useState(
    monitor?.autoPublish ?? false,
  );
  const [adapter, setAdapter] = useState(monitor?.adapter ?? "json");
  const [configText, setConfigText] = useState(
    JSON.stringify(
      monitor?.config ??
        (monitor?.adapter === "html" || monitor?.adapter === "whmcs"
          ? defaultHtmlConfig
          : defaultJsonConfig),
      null,
      2,
    ),
  );
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof previewProviderMonitorAction>
  > | null>(null);

  function actionInput(formData: FormData) {
    return {
      id: monitor?.id,
      providerId: Number(formData.get("providerId")),
      name: getFormDataText(formData, "name"),
      adapter: adapter as "json" | "html" | "whmcs",
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
    startTransition(async () => {
      const result = await saveProviderMonitorAction(actionInput(formData));
      if (!result.success) {
        showFailure(result);
        return;
      }
      toast.success(result.message ?? "供应商采集源已保存", {
        description: enabled
          ? "配置已启用，后台会按执行间隔采集供应商套餐。"
          : "配置已保存为停用状态。",
      });
      onOpenChange(false);
      router.refresh();
    });
  }

  function runPreview(formData: FormData) {
    startTransition(async () => {
      const result = await previewProviderMonitorAction(actionInput(formData));
      setPreview(result);
      if (!result.success) {
        showFailure(result);
        return;
      }
      toast.success(result.message ?? "采集预览完成", {
        description: "预览不会写入候选或套餐数据。",
      });
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{monitor ? "编辑供应商采集源" : "新增供应商采集源"}</DialogTitle>
          <DialogDescription>
            从供应商 JSON、HTML 或 WHMCS 产品页采集具体配置、价格和独立购买链接。
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="monitor-provider">厂商</Label>
              <Select
                name="providerId"
                defaultValue={String(monitor?.providerId ?? providers[0]?.id ?? "")}
              >
                <SelectTrigger id="monitor-provider" className="min-h-11">
                  <SelectValue placeholder="选择厂商" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={String(provider.id)}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  setAdapter(value);
                  setConfigText(
                    JSON.stringify(
                      value === "json" ? defaultJsonConfig : defaultHtmlConfig,
                      null,
                      2,
                    ),
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
              <Select name="purpose" defaultValue={monitor?.purpose ?? "catalog"}>
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
              JSON 使用字段路径；HTML/WHMCS 使用 itemSelector 和 CSS 选择器。每个套餐必须有稳定产品 ID、价格、配置和独立购买链接。
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
                <span className="block text-sm font-medium">新套餐自动发布</span>
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
                    HTTP {preview.data.httpStatus} · 识别 {preview.data.total} 个套餐 · 展示前 {preview.data.items.length} 个
                  </p>
                  {preview.data.items.map((item, index) => (
                    <div key={`${item.candidate.externalProductId}-${index}`} className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
                      <Badge variant={item.quality.valid ? "outline" : "destructive"}>
                        {item.quality.valid ? "有效" : "需调整映射"}
                      </Badge>
                      <span className="font-medium">{item.candidate.title || "未识别标题"}</span>
                      <span className="font-mono text-muted-foreground">{item.candidate.externalProductId || "无产品 ID"}</span>
                      <span className="text-muted-foreground">
                        {item.candidate.prices[0]?.currency} {item.candidate.prices[0]?.amount}
                      </span>
                      {!item.quality.valid ? (
                        <span className="text-destructive">{item.quality.reasons.join("；")}</span>
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
              disabled={isPending}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="outline"
              formAction={runPreview}
              disabled={isPending || providers.length === 0}
            >
              <Eye className="size-4" />
              {isPending ? "检测中..." : "预览采集"}
            </Button>
            <Button type="submit" disabled={isPending || providers.length === 0}>
              {isPending ? "保存中..." : "保存配置"}
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
  const router = useRouter();
  const [editing, setEditing] = useState<Monitor | null>(null);
  const [deleting, setDeleting] = useState<Monitor | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function openEditor(monitor: Monitor | null) {
    setEditing(monitor);
    setDialogOpen(true);
  }

  function runNow(monitor: Monitor) {
    startTransition(async () => {
      const result = await runProviderMonitorNowAction(monitor.id);
      if (!result.success) {
        showFailure(result);
        return;
      }
      toast.success(result.message ?? "检测任务已排队", {
        description: `${monitor.providerName} · ${monitor.name}`,
      });
      router.refresh();
    });
  }

  function remove(monitor: Monitor) {
    startTransition(async () => {
      const result = await deleteProviderMonitorAction(monitor.id);
      if (!result.success) {
        showFailure(result);
        return;
      }
      toast.success(result.message ?? "监控配置已删除");
      setDeleting(null);
      router.refresh();
    });
  }

  function reviewCandidate(
    candidate: CandidateRow,
    decision: "accept" | "reject",
  ) {
    startTransition(async () => {
      const result = await reviewProviderOfferCandidateAction({
        candidateId: candidate.id,
        decision,
      });
      if (!result.success) {
        showFailure(result);
        return;
      }
      toast.success(result.message ?? "候选状态已更新", {
        description: `${candidate.providerName} · ${candidate.externalProductId}`,
      });
      router.refresh();
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
            {monitors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  还没有供应商采集源。
                </TableCell>
              </TableRow>
            ) : null}
            {monitors.map((monitor) => (
              <TableRow key={monitor.id} className="align-top">
                <TableCell className="min-w-48">
                  <p className="font-medium text-foreground">{monitor.providerName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{monitor.name}</p>
                  <Badge variant={monitor.enabled ? "secondary" : "outline"} className="mt-2">
                    {monitor.enabled ? `每 ${monitor.intervalMinutes} 分钟` : "已停用"}
                  </Badge>
                  <Badge variant="outline" className="ml-2 mt-2">
                    {purposeLabels[monitor.purpose] ?? monitor.purpose}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-80">
                  <p className="truncate font-mono text-xs" title={monitor.endpointUrl}>
                    {monitor.endpointUrl}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    超时 {monitor.timeoutSeconds} 秒 · {adapterLabels[monitor.adapter] ?? monitor.adapter}
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
                    variant={monitor.lastStatus === "failed" ? "destructive" : "outline"}
                  >
                    {monitorStatusLabels[monitor.lastStatus] ?? monitor.lastStatus}
                  </Badge>
                  {monitor.lastError ? (
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-destructive" title={monitor.lastError}>
                      {monitor.lastError}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  <p>上次：{formatDate(monitor.lastRunAt)}</p>
                  <p className="mt-1">下次：{formatDate(monitor.nextRunAt)}</p>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      title="立即采集"
                      aria-label={`立即采集 ${monitor.name}`}
                      disabled={isPending || !monitor.enabled}
                      onClick={() => runNow(monitor)}
                    >
                      <Play className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      title="编辑采集源"
                      aria-label={`编辑 ${monitor.name}`}
                      disabled={isPending}
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
                      disabled={isPending}
                      onClick={() => setDeleting(monitor)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">待审核套餐</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              新识别套餐默认不会发布；确认配置、价格和购买链接后再接受。
            </p>
          </div>
          <Badge variant={candidates.length > 0 ? "secondary" : "outline"}>
            {candidates.length} 个待处理
          </Badge>
        </div>
        <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead>供应商 / 产品 ID</TableHead>
                <TableHead>套餐配置</TableHead>
                <TableHead>价格</TableHead>
                <TableHead>购买链接</TableHead>
                <TableHead>发现时间</TableHead>
                <TableHead className="text-right">审核</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    当前没有待审核套餐。
                  </TableCell>
                </TableRow>
              ) : null}
              {candidates.map((candidate) => {
                const data = getCandidateData(candidate);
                const price = data.prices?.[0];
                return (
                  <TableRow key={candidate.id} className="align-top">
                    <TableCell className="min-w-48">
                      <p className="font-medium">{candidate.providerName}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {candidate.externalProductId}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{candidate.monitorName}</p>
                    </TableCell>
                    <TableCell className="min-w-64">
                      <p className="font-medium">{data.title ?? "未命名套餐"}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {[data.cpu, data.memory, data.storage, data.region]
                          .filter(Boolean)
                          .join(" · ") || "暂无配置摘要"}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {price?.amount
                        ? `${price.currency ?? "USD"} ${price.amount} / ${price.billingCycle ?? "monthly"}`
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
                          disabled={isPending}
                          onClick={() => reviewCandidate(candidate, "reject")}
                        >
                          <X className="size-4 text-destructive" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          title="接受并创建套餐"
                          aria-label={`接受 ${data.title ?? candidate.externalProductId}`}
                          disabled={isPending}
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
      </div>

      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">采集运行历史</h3>
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
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    暂无采集运行记录。
                  </TableCell>
                </TableRow>
              ) : null}
              {runs.map((run) => (
                <TableRow key={run.id} className="align-top">
                  <TableCell className="whitespace-nowrap text-xs">{formatDate(run.startedAt)}</TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{run.providerName}</p>
                    <p className="text-xs text-muted-foreground">{run.monitorName}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={run.status === "failed" ? "destructive" : run.status === "running" ? "secondary" : "outline"}>
                      {run.status === "succeeded" ? "成功" : run.status === "running" ? "运行中" : "失败"}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">HTTP {run.httpStatus ?? "-"}</p>
                  </TableCell>
                  <TableCell className="tabular-nums">{run.received}</TableCell>
                  <TableCell className="tabular-nums">{run.created} / {run.pending}</TableCell>
                  <TableCell className="tabular-nums">{run.updated} / {run.unchanged}</TableCell>
                  <TableCell className="tabular-nums">{run.skipped} / {run.missing}</TableCell>
                  <TableCell className="max-w-72">
                    {run.errorDetail ? (
                      <p className="line-clamp-3 text-xs leading-5 text-destructive" title={run.errorDetail}>
                        {run.errorTitle ? `${run.errorTitle}：` : ""}{run.errorDetail}
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
          <h3 className="text-sm font-semibold text-foreground">套餐级检查记录</h3>
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
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
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
                    <p className="truncate text-sm font-medium">{check.offerTitle}</p>
                    <p className="text-xs text-muted-foreground">{check.providerName ?? "未知厂商"}</p>
                  </TableCell>
                  <TableCell>
                    {check.available === null ? "未知" : check.available ? "有货" : "无货"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {check.priceAmount
                      ? `${check.currency === "CNY" ? "¥" : "$"}${check.priceAmount}`
                      : "-"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {check.responseTimeMs === null ? "-" : `${check.responseTimeMs} ms`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={check.status === "ok" ? "outline" : "destructive"}>
                      {check.status === "ok" ? "正常" : check.status}
                    </Badge>
                    {check.error ? (
                      <p className="mt-1 max-w-72 truncate text-xs text-destructive" title={check.error}>
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
          key={editing?.id ?? "new"}
          monitor={editing}
          providers={providers}
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
            <AlertDialogTitle>删除供应商采集源？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `将删除“${deleting.providerName} · ${deleting.name}”及其运行历史和待审核候选，已有套餐不会被删除。`
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
