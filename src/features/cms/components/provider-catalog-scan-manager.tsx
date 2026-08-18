"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Copy, LoaderCircle, RefreshCw, Search } from "lucide-react";

import {
  getProviderCatalogScanDetailAction,
  startProviderCatalogScansAction,
} from "@/features/cms/actions/provider-catalog-scans";
import { useAdminMutation } from "@/features/cms/hooks/use-admin-mutation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { getProviderOptionsForMonitoring } from "@/server/offers/provider-monitor";
import type {
  getProviderCatalogScanDetail,
  getProviderCatalogScanList,
} from "@/server/providers/provider-catalog-scan-tasks";
import {
  notifyActionError,
  notifyError,
  notifySuccess,
} from "@/lib/admin-toast";

type Provider = Awaited<
  ReturnType<typeof getProviderOptionsForMonitoring>
>[number];
type Scan = Awaited<ReturnType<typeof getProviderCatalogScanList>>[number];
type ScanDetail = NonNullable<
  Awaited<ReturnType<typeof getProviderCatalogScanDetail>>
>;

const activeStatuses = new Set(["queued", "running"]);

const statusLabels: Record<string, string> = {
  queued: "等待中",
  running: "扫描中",
  succeeded: "已完成",
  partial: "部分完成",
  needs_auth: "需人工处理",
  failed: "失败",
  cancelled: "已取消",
};

const stepLabels: Record<string, string> = {
  queued: "等待后台任务",
  discovering_pages: "发现公开页面",
  pages_captured: "页面已读取",
  ai_mapping: "AI 映射字段",
  mapping_validated: "映射已校验",
  source_monitoring: "提取套餐候选",
  manual_follow_up: "等待人工处理",
  completed: "完成",
  failed: "失败",
};

function formatDate(value: Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function getStatusVariant(status: string) {
  if (status === "failed") return "destructive" as const;
  if (status === "succeeded") return "default" as const;
  return "outline" as const;
}

function getProviderDomain(officialUrl: string) {
  try {
    return new URL(
      officialUrl.includes("://") ? officialUrl : `https://${officialUrl}`,
    ).hostname;
  } catch {
    return officialUrl;
  }
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/30 p-3 text-xs leading-5">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function AuditJsonBlock({
  title,
  value,
  onCopy,
}: {
  title: string;
  value: unknown;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">{title}</h4>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={`复制${title}`}
          onClick={onCopy}
        >
          <Copy className="size-4" />
          <span className="sr-only">复制{title}</span>
        </Button>
      </div>
      <JsonBlock value={value} />
    </div>
  );
}

export function ProviderCatalogScanManager({
  providers,
  scans,
}: {
  providers: Provider[];
  scans: Scan[];
}) {
  const router = useRouter();
  const { mutate, isPending } = useAdminMutation();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleProviders = useMemo(
    () =>
      providers.filter((provider) => {
        if (!normalizedQuery) return true;
        return `${provider.name} ${provider.slug ?? ""} ${provider.officialUrl}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      }),
    [normalizedQuery, providers],
  );
  const activeProviderIds = useMemo(
    () =>
      new Set(
        scans
          .filter((scan) => activeStatuses.has(scan.status))
          .map((scan) => scan.providerId),
      ),
    [scans],
  );
  const hasActiveScans = activeProviderIds.size > 0;
  const visibleSelected = visibleProviders.filter((provider) =>
    selectedIds.includes(provider.id),
  );
  const allVisibleSelected =
    visibleProviders.length > 0 &&
    visibleSelected.length === visibleProviders.length;
  const startKey = "provider-catalog-scan:start";

  useEffect(() => {
    if (!hasActiveScans) return;
    const timer = window.setInterval(() => router.refresh(), 4_000);
    return () => window.clearInterval(timer);
  }, [hasActiveScans, router]);

  function toggleProvider(providerId: number, checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? current.includes(providerId)
          ? current
          : [...current, providerId]
        : current.filter((id) => id !== providerId),
    );
  }

  function toggleVisible(checked: boolean) {
    const visibleIds = new Set(visibleProviders.map((provider) => provider.id));
    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, ...visibleIds])]
        : current.filter((id) => !visibleIds.has(id)),
    );
  }

  function startScans(providerIds = selectedIds) {
    if (providerIds.length === 0) return;
    void mutate({
      key: startKey,
      action: () => startProviderCatalogScansAction({ providerIds }),
      pendingMessage: `正在启动 ${providerIds.length} 个供应商扫描...`,
      successMessage: "供应商套餐扫描已进入后台队列",
      errorTitle: "启动供应商套餐扫描失败",
      errorSuggestion: "请检查供应商官网、默认 AI 配置和后台任务状态。",
      onSuccess: () => setSelectedIds([]),
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 border-b pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">AI 一次性扫描</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              已选择 {selectedIds.length} 个，共 {providers.length} 个供应商
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="刷新扫描状态"
              onClick={() => router.refresh()}
            >
              <RefreshCw className="size-4" />
              <span className="sr-only">刷新扫描状态</span>
            </Button>
            <Button
              type="button"
              onClick={() => startScans()}
              disabled={selectedIds.length === 0 || isPending(startKey)}
            >
              {isPending(startKey) ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Bot className="size-4" />
              )}
              扫描所选供应商
            </Button>
          </div>
        </div>

        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索供应商、域名或 slug"
            className="pl-9"
          />
        </div>

        <div className="overflow-hidden rounded-md border">
          <div className="flex min-h-11 items-center gap-3 border-b bg-muted/30 px-3 text-sm">
            <Checkbox
              checked={
                allVisibleSelected
                  ? true
                  : visibleSelected.length > 0
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(checked) => toggleVisible(checked === true)}
              aria-label="选择当前筛选的全部供应商"
            />
            <span>当前结果 {visibleProviders.length}</span>
          </div>
          <div className="grid max-h-64 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
            {visibleProviders.map((provider) => (
              <label
                key={provider.id}
                className="flex min-h-14 cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm hover:bg-muted/30 sm:border-r"
              >
                <Checkbox
                  checked={selectedIds.includes(provider.id)}
                  onCheckedChange={(checked) =>
                    toggleProvider(provider.id, checked === true)
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {provider.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {getProviderDomain(provider.officialUrl)}
                  </span>
                </span>
                {activeProviderIds.has(provider.id) ? (
                  <Badge variant="outline">进行中</Badge>
                ) : null}
              </label>
            ))}
            {visibleProviders.length === 0 ? (
              <p className="col-span-full px-4 py-8 text-center text-sm text-muted-foreground">
                没有匹配的供应商
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">扫描记录</h3>
          {hasActiveScans ? (
            <Badge variant="outline">
              <LoaderCircle className="mr-1 size-3 animate-spin" />
              自动刷新
            </Badge>
          ) : null}
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table className="cms-mobile-sticky-actions min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">ID</TableHead>
                <TableHead>供应商</TableHead>
                <TableHead className="w-32">状态</TableHead>
                <TableHead className="w-64">进度</TableHead>
                <TableHead className="w-44">结果</TableHead>
                <TableHead className="w-44">创建时间</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scans.map((scan) => (
                <ProviderCatalogScanRow
                  key={scan.id}
                  scan={scan}
                  pending={isPending(startKey)}
                  onRetry={() => startScans([scan.providerId])}
                />
              ))}
              {scans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    暂无扫描记录
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function ProviderCatalogScanRow({
  scan,
  pending,
  onRetry,
}: {
  scan: Scan;
  pending: boolean;
  onRetry: () => void;
}) {
  const terminal = !activeStatuses.has(scan.status);
  const [detail, setDetail] = useState<ScanDetail | null>(null);
  const [detailPending, setDetailPending] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function loadDetail() {
    if (detailPending) return;
    setDetailPending(true);
    setDetailError(null);
    try {
      const result = await getProviderCatalogScanDetailAction({
        scanId: scan.id,
      });
      if (!result.success) {
        setDetailError(result.message);
        notifyActionError(result, {
          title: "读取扫描审计详情失败",
          fallbackSuggestion: "请刷新页面后重试。",
        });
        return;
      }
      setDetail(result.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "请求未完成";
      setDetailError(message);
      notifyError({
        title: "读取扫描审计详情失败",
        description: message,
      });
    } finally {
      setDetailPending(false);
    }
  }

  async function copyText(value: string | null, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      notifySuccess({ title: `${label}已复制` });
    } catch {
      notifyError({
        title: "复制失败",
        description: "请在审计详情中手动选择并复制。",
      });
    }
  }

  return (
    <>
      <TableRow>
        <TableCell className="font-mono">#{scan.id}</TableCell>
        <TableCell className="font-medium">{scan.providerName}</TableCell>
        <TableCell>
          <Badge variant={getStatusVariant(scan.status)}>
            {statusLabels[scan.status] ?? scan.status}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="space-y-1.5">
            <div className="flex justify-between gap-3 text-xs">
              <span>{stepLabels[scan.currentStep] ?? scan.currentStep}</span>
              <span>{scan.progress}%</span>
            </div>
            <Progress value={scan.progress} />
          </div>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          采集源 {scan.monitorCount}/{scan.sourceCount} · 待审核候选{" "}
          {scan.candidateCount}
        </TableCell>
        <TableCell className="text-xs">{formatDate(scan.createdAt)}</TableCell>
        <TableCell className="text-right">
          {terminal ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="重新扫描该供应商"
              onClick={onRetry}
              disabled={pending}
            >
              <RefreshCw className="size-4" />
              <span className="sr-only">重新扫描</span>
            </Button>
          ) : null}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={7} className="bg-muted/10 p-0">
          <details
            className="group px-4 py-3"
            onToggle={(event) => {
              if (event.currentTarget.open && !detail && !detailPending) {
                void loadDetail();
              }
            }}
          >
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              审计详情
            </summary>
            {detailPending && !detail ? (
              <div className="flex min-h-24 items-center justify-center gap-2 text-xs text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                正在读取审计详情
              </div>
            ) : null}
            {detailError && !detail ? (
              <div className="mt-4 flex min-h-24 flex-col items-center justify-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-xs">
                <p className="text-destructive">{detailError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadDetail()}
                  disabled={detailPending}
                >
                  <RefreshCw className="size-4" />
                  重试
                </Button>
              </div>
            ) : null}
            {detail ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="flex items-center justify-end xl:col-span-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="刷新审计详情"
                    onClick={() => void loadDetail()}
                    disabled={detailPending}
                  >
                    <RefreshCw
                      className={`size-4 ${detailPending ? "animate-spin" : ""}`}
                    />
                    <span className="sr-only">刷新审计详情</span>
                  </Button>
                </div>
                <AuditJsonBlock
                  title="发现 URL"
                  value={detail.discoveredUrls}
                  onCopy={() =>
                    void copyText(
                      JSON.stringify(detail.discoveredUrls, null, 2),
                      "发现 URL",
                    )
                  }
                />
                <AuditJsonBlock
                  title="校验后的来源映射"
                  value={detail.sourceMappings}
                  onCopy={() =>
                    void copyText(
                      JSON.stringify(detail.sourceMappings, null, 2),
                      "来源映射",
                    )
                  }
                />
                <div className="xl:col-span-2">
                  <AuditJsonBlock
                    title="采集源运行诊断"
                    value={detail.sourceDiagnostics}
                    onCopy={() =>
                      void copyText(
                        JSON.stringify(detail.sourceDiagnostics, null, 2),
                        "运行诊断",
                      )
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold">实际 Prompt</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="复制实际 Prompt"
                      disabled={!detail.prompt}
                      onClick={() =>
                        void copyText(detail.prompt, "实际 Prompt")
                      }
                    >
                      <Copy className="size-4" />
                      <span className="sr-only">复制实际 Prompt</span>
                    </Button>
                  </div>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-xs leading-5">
                    {detail.prompt ?? "尚未调用 AI"}
                  </pre>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold">AI 原始输出</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="复制 AI 原始输出"
                      disabled={!detail.aiResponse}
                      onClick={() =>
                        void copyText(detail.aiResponse, "AI 原始输出")
                      }
                    >
                      <Copy className="size-4" />
                      <span className="sr-only">复制 AI 原始输出</span>
                    </Button>
                  </div>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-xs leading-5">
                    {detail.aiResponse ?? "尚无 AI 输出"}
                  </pre>
                </div>
                {detail.warnings.length > 0 || detail.error ? (
                  <div className="space-y-2 xl:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold">错误与警告</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="复制错误与警告"
                        onClick={() =>
                          void copyText(
                            [detail.error, ...detail.warnings]
                              .filter(Boolean)
                              .join("\n"),
                            "错误与警告",
                          )
                        }
                      >
                        <Copy className="size-4" />
                        <span className="sr-only">复制错误与警告</span>
                      </Button>
                    </div>
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs leading-5">
                      {detail.error ? (
                        <p className="break-words text-destructive">
                          {detail.error}
                        </p>
                      ) : null}
                      {detail.warnings.map((warning, index) => (
                        <p key={`${scan.id}-${index}`} className="break-words">
                          {warning}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground xl:col-span-2">
                  页面读取：{formatDate(detail.capturedAt)} · 开始：
                  {formatDate(detail.startedAt)} · 结束：
                  {formatDate(detail.finishedAt)}
                </p>
              </div>
            ) : null}
          </details>
        </TableCell>
      </TableRow>
    </>
  );
}
