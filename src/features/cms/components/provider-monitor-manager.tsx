"use client";

import { useState, useTransition } from "react";
import { Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  deleteProviderMonitorAction,
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
  getProviderOptionsForMonitoring,
} from "@/server/offers/provider-monitor";

type Monitor = Awaited<ReturnType<typeof getProviderMonitorList>>[number];
type Provider = Awaited<
  ReturnType<typeof getProviderOptionsForMonitoring>
>[number];
type CheckRow = Awaited<
  ReturnType<typeof getProviderMonitorCheckHistory>
>[number];

const defaultConfig = {
  itemsPath: "data",
  externalIdField: "id",
  statusField: "status",
  titleField: "name",
  priceField: "price",
  currencyField: "currency",
  billingCycleField: "billingCycle",
  purchaseUrlField: "purchaseUrl",
  statusMap: {},
  headers: {},
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

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await saveProviderMonitorAction({
        id: monitor?.id,
        providerId: Number(formData.get("providerId")),
        name: getFormDataText(formData, "name"),
        endpointUrl: getFormDataText(formData, "endpointUrl"),
        configText: getFormDataText(formData, "configText"),
        enabled,
        intervalMinutes: Number(formData.get("intervalMinutes")),
        timeoutSeconds: Number(formData.get("timeoutSeconds")),
      });
      if (!result.success) {
        showFailure(result);
        return;
      }
      toast.success(result.message ?? "库存监控已保存", {
        description: enabled
          ? "配置已启用，后台会按执行间隔检测库存。"
          : "配置已保存为停用状态。",
      });
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{monitor ? "编辑库存监控" : "新增库存监控"}</DialogTitle>
          <DialogDescription>
            使用厂商公开 JSON 接口，通过 externalProductId 对应套餐。接口只能指向公网 HTTP/HTTPS 地址。
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
              <Label htmlFor="monitor-name">监控名称</Label>
              <Input
                id="monitor-name"
                name="name"
                defaultValue={monitor?.name ?? "默认库存接口"}
                required
                className="min-h-11"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="monitor-endpoint">JSON 接口 URL</Label>
            <Input
              id="monitor-endpoint"
              name="endpointUrl"
              type="url"
              defaultValue={monitor?.endpointUrl ?? ""}
              placeholder="https://provider.example/api/products"
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
              defaultValue={JSON.stringify(monitor?.config ?? defaultConfig, null, 2)}
              className="min-h-72 font-mono text-xs leading-5"
              spellCheck={false}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              pricesPath 可映射多周期价格；statusMap 用于把厂商状态转换为 in_stock、out_of_stock、restocking、preorder 或 discontinued。
            </p>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-4 rounded-md border border-border/70 px-3">
            <span>
              <span className="block text-sm font-medium">启用定时监控</span>
              <span className="block text-xs text-muted-foreground">
                启用后会立即执行一次，并按间隔继续运行。
              </span>
            </span>
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
  checks,
}: {
  monitors: Monitor[];
  providers: Provider[];
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

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => openEditor(null)}>
          <Plus className="size-4" />
          新增监控
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead>厂商 / 配置</TableHead>
              <TableHead>接口</TableHead>
              <TableHead>映射套餐</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>执行时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monitors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  还没有库存监控配置。
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
                </TableCell>
                <TableCell className="max-w-80">
                  <p className="truncate font-mono text-xs" title={monitor.endpointUrl}>
                    {monitor.endpointUrl}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    超时 {monitor.timeoutSeconds} 秒 · JSON
                  </p>
                </TableCell>
                <TableCell className="tabular-nums">{monitor.mappedOfferCount}</TableCell>
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
                      title="立即检测"
                      aria-label={`立即检测 ${monitor.name}`}
                      disabled={isPending || !monitor.enabled}
                      onClick={() => runNow(monitor)}
                    >
                      <Play className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      title="编辑监控"
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
                      title="删除监控"
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
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">最近检测记录</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            只保留套餐级检测结果，便于判断库存、价格和接口稳定性。
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
            <AlertDialogTitle>删除库存监控？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `将删除“${deleting.providerName} · ${deleting.name}”及其定时计划，已有套餐和历史检测记录不会被删除。`
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
