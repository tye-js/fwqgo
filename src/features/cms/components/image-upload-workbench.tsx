"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AdminSectionCard } from "@/features/cms/components/admin-page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOptimizedImageSrc } from "@fwqgo/core/image-src";
import { cn } from "@fwqgo/core/utils";

type UploadStatus = "pending" | "uploading" | "success" | "error";

type UploadItem = {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  url: string | null;
  message: string | null;
};

export function ImageUploadWorkbench() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const summary = useMemo(() => {
    const success = items.filter((item) => item.status === "success").length;
    const failed = items.filter((item) => item.status === "error").length;
    return { success, failed, total: items.length };
  }, [items]);

  function handleSelect(files: FileList | null) {
    if (!files?.length) return;

    const nextItems = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      status: "pending" as const,
      progress: 0,
      url: null,
      message: null,
    }));

    setItems((prev) => [...nextItems, ...prev]);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function uploadOne(item: UploadItem) {
    setItems((prev) =>
      prev.map((current) =>
        current.id === item.id
          ? {
              ...current,
              status: "uploading",
              progress: 35,
              message: "正在上传并转换 WebP",
            }
          : current,
      ),
    );

    const formData = new FormData();
    formData.append("file", item.file);

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json().catch(() => null)) as {
      data?: { url?: string };
      url?: string;
      error?: string;
      message?: string;
      actionError?: { message?: string };
    } | null;
    const uploadedUrl = payload?.data?.url ?? payload?.url;

    if (!response.ok || !uploadedUrl) {
      throw new Error(
        payload?.actionError?.message ??
          payload?.message ??
          payload?.error ??
          `上传失败，HTTP ${response.status}`,
      );
    }

    setItems((prev) =>
      prev.map((current) =>
        current.id === item.id
          ? {
              ...current,
              status: "success",
              progress: 100,
              url: uploadedUrl,
              message: "已入库",
            }
          : current,
      ),
    );
  }

  async function handleUploadAll() {
    const queue = items.filter(
      (item) => item.status === "pending" || item.status === "error",
    );
    if (queue.length === 0) {
      toast.info("没有待上传图片");
      return;
    }

    setIsUploading(true);
    let success = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        await uploadOne(item);
        success += 1;
      } catch (error) {
        failed += 1;
        setItems((prev) =>
          prev.map((current) =>
            current.id === item.id
              ? {
                  ...current,
                  status: "error",
                  progress: 100,
                  message: error instanceof Error ? error.message : "上传失败",
                }
              : current,
          ),
        );
      }
    }

    setIsUploading(false);
    if (failed > 0) {
      toast.warning(`上传完成：成功 ${success}，失败 ${failed}`);
    } else {
      toast.success(`上传完成：成功 ${success}`);
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("图片 URL 已复制");
    } catch {
      toast.error("图片 URL 复制失败，请手动复制");
    }
  }

  return (
    <div className="space-y-4">
      <AdminSectionCard>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">JPEG / PNG / WebP 自动转 WebP</Badge>
              <Badge variant="outline">GIF 保持原格式</Badge>
              <Badge variant="outline">单张最大 8MB</Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              上传成功后会写入图片资产库，并可在文章封面、正文图片库中复用。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              hidden
              onChange={(event) => handleSelect(event.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus className="size-4" />
              选择图片
            </Button>
            <Button
              type="button"
              disabled={isUploading || items.length === 0}
              onClick={() => void handleUploadAll()}
            >
              {isUploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              开始上传
            </Button>
          </div>
        </div>
      </AdminSectionCard>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric
          label="待处理"
          value={String(summary.total - summary.success)}
        />
        <Metric label="已完成" value={String(summary.success)} />
        <Metric label="失败" value={String(summary.failed)} />
      </div>

      <AdminSectionCard>
        {items.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 text-center">
            <ImagePlus className="size-9 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">还没有选择图片</p>
              <p className="mt-1 text-sm text-muted-foreground">
                可以一次选择多张图片，上传后自动进入图片资产库。
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[96px]">预览</TableHead>
                <TableHead>文件</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Preview item={item} />
                  </TableCell>
                  <TableCell className="min-w-[240px]">
                    <p className="line-clamp-1 font-medium text-foreground">
                      {item.file.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.file.type || "未知类型"} /{" "}
                      {formatBytes(item.file.size)}
                    </p>
                  </TableCell>
                  <TableCell className="min-w-[220px]">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={item.status} />
                        {item.message ? (
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {item.message}
                          </span>
                        ) : null}
                      </div>
                      <Progress value={item.progress} className="h-2" />
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[260px]">
                    {item.url ? (
                      <button
                        type="button"
                        className="max-w-[320px] truncate text-left text-xs text-muted-foreground hover:text-accent"
                        onClick={() => void handleCopy(item.url!)}
                      >
                        {item.url}
                      </button>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        上传后生成
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {item.status === "error" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title="重试"
                          disabled={isUploading}
                          onClick={() =>
                            setItems((prev) =>
                              prev.map((current) =>
                                current.id === item.id
                                  ? {
                                      ...current,
                                      status: "pending",
                                      progress: 0,
                                      message: null,
                                    }
                                  : current,
                              ),
                            )
                          }
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                      ) : null}
                      {item.url ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="复制 URL"
                            onClick={() => void handleCopy(item.url!)}
                          >
                            <Copy className="size-4" />
                          </Button>
                          <Button
                            asChild
                            variant="outline"
                            size="icon"
                            title="打开原图"
                          >
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="size-4" />
                            </a>
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AdminSectionCard>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Preview({ item }: { item: UploadItem }) {
  const localPreviewSrc = useMemo(
    () => (item.url ? null : URL.createObjectURL(item.file)),
    [item.file, item.url],
  );

  useEffect(() => {
    return () => {
      if (localPreviewSrc) {
        URL.revokeObjectURL(localPreviewSrc);
      }
    };
  }, [localPreviewSrc]);

  const previewSrc = item.url
    ? getOptimizedImageSrc(item.url)
    : localPreviewSrc;

  if (!previewSrc) {
    return (
      <div className="h-16 w-20 rounded-md border border-border bg-muted" />
    );
  }

  return (
    <div className="relative h-16 w-20 overflow-hidden rounded-md border border-border bg-muted">
      <Image
        src={previewSrc}
        alt={item.file.name}
        fill
        unoptimized={!item.url}
        sizes="80px"
        className="object-cover"
      />
    </div>
  );
}

function StatusBadge({ status }: { status: UploadStatus }) {
  const statusMap: Record<
    UploadStatus,
    { label: string; className?: string; icon: ReactNode }
  > = {
    pending: { label: "待上传", icon: <ImagePlus className="size-3" /> },
    uploading: {
      label: "上传中",
      icon: <Loader2 className="size-3 animate-spin" />,
    },
    success: {
      label: "成功",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: <CheckCircle2 className="size-3" />,
    },
    error: {
      label: "失败",
      className: "border-destructive/30 bg-destructive/10 text-destructive",
      icon: <XCircle className="size-3" />,
    },
  };
  const item = statusMap[status];

  return (
    <Badge variant="outline" className={cn("gap-1", item.className)}>
      {item.icon}
      {item.label}
    </Badge>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
