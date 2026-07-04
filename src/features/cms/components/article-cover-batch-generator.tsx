"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  ImagePlus,
  Loader2,
  XCircle,
} from "lucide-react";

import {
  batchGenerateArticleCoverImagesAction,
  getCoverGenerationBatchStatusAction,
} from "@/features/cms/actions/article-cover-image";
import {
  AdminTableEmpty,
  AdminTableWorkbench,
} from "@/features/cms/components/admin-table-workbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  describeAdminResult,
  notifyError,
  notifyInfo,
  notifySuccess,
} from "@/lib/admin-toast";

export type CoverGenerationPost = {
  id: number;
  title: string;
  slug: string;
  imgUrl: string | null;
  published: boolean;
  categoryName: string | null;
  updatedAt: Date | string | null;
};

type GenerateResult = {
  taskId?: number;
  postId: number;
  title?: string;
  status?: "pending" | "running" | "succeeded" | "failed";
  success: boolean;
  url?: string;
  assetId?: number;
  error?: string;
  errorTitle?: string;
  errorDetail?: string;
};

type BatchStatusResult = {
  success: boolean;
  batchId?: string;
  results?: GenerateResult[];
  successCount?: number;
  failedCount?: number;
  pendingCount?: number;
  runningCount?: number;
  done?: boolean;
  error?: string;
  errorTitle?: string;
};

function formatTime(value: Date | string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getResultStatus(result: GenerateResult) {
  return result.status ?? (result.success ? "succeeded" : "failed");
}

function getResultBadge(result: GenerateResult) {
  const status = getResultStatus(result);

  if (status === "succeeded") {
    return {
      label: "成功",
      icon: CheckCircle2,
      variant: "default" as const,
    };
  }

  if (status === "failed") {
    return {
      label: "失败",
      icon: XCircle,
      variant: "destructive" as const,
    };
  }

  if (status === "running") {
    return {
      label: "生成中",
      icon: Loader2,
      variant: "secondary" as const,
    };
  }

  return {
    label: "排队中",
    icon: Clock3,
    variant: "outline" as const,
  };
}

export function ArticleCoverBatchGenerator({
  posts,
}: {
  posts: CoverGenerationPost[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [coverFilter, setCoverFilter] = useState<
    "all" | "missing" | "has-cover"
  >("missing");
  const [selectedIds, setSelectedIds] = useState<number[]>(
    posts
      .filter((post) => !post.imgUrl)
      .slice(0, 20)
      .map((post) => post.id),
  );
  const [results, setResults] = useState<GenerateResult[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [batchSummary, setBatchSummary] = useState({
    successCount: 0,
    failedCount: 0,
    pendingCount: 0,
    runningCount: 0,
    done: true,
  });

  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return posts.filter((post) => {
      const matchesQuery =
        !normalizedQuery ||
        post.title.toLowerCase().includes(normalizedQuery) ||
        post.slug.toLowerCase().includes(normalizedQuery) ||
        (post.categoryName?.toLowerCase().includes(normalizedQuery) ?? false);
      const matchesCover =
        coverFilter === "all" ||
        (coverFilter === "missing" ? !post.imgUrl : Boolean(post.imgUrl));

      return matchesQuery && matchesCover;
    });
  }, [coverFilter, posts, query]);

  const selectedSet = new Set(selectedIds);
  const selectableFilteredPosts = filteredPosts.slice(0, 20);
  const allFilteredSelected =
    selectableFilteredPosts.length > 0 &&
    selectableFilteredPosts.every((post) => selectedSet.has(post.id));
  const selectedPosts = posts.filter((post) => selectedSet.has(post.id));
  const selectedWithoutCoverCount = selectedPosts.filter(
    (post) => !post.imgUrl,
  ).length;
  const isBatchRunning =
    Boolean(batchId) &&
    (batchSummary.runningCount > 0 || batchSummary.pendingCount > 0);
  const isBusy = isStarting || isBatchRunning;

  function toggleSelected(id: number, checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, id])].slice(0, 20)
        : current.filter((item) => item !== id),
    );
  }

  function toggleAllFiltered(checked: boolean) {
    if (!checked) {
      setSelectedIds((current) =>
        current.filter((id) => !filteredPosts.some((post) => post.id === id)),
      );
      return;
    }

    setSelectedIds((current) =>
      [
        ...new Set([
          ...current,
          ...selectableFilteredPosts.map((post) => post.id),
        ]),
      ].slice(0, 20),
    );
  }

  function selectMissingCovers() {
    setCoverFilter("missing");
    setSelectedIds(
      posts
        .filter((post) => !post.imgUrl)
        .slice(0, 20)
        .map((post) => post.id),
    );
  }

  const applyBatchStatus = useCallback((result: BatchStatusResult) => {
    const resultRows = result.results ?? [];
    setResults(resultRows);
    setBatchSummary({
      successCount:
        result.successCount ??
        resultRows.filter((item) => getResultStatus(item) === "succeeded")
          .length,
      failedCount:
        result.failedCount ??
        resultRows.filter((item) => getResultStatus(item) === "failed").length,
      pendingCount:
        result.pendingCount ??
        resultRows.filter((item) => getResultStatus(item) === "pending").length,
      runningCount:
        result.runningCount ??
        resultRows.filter((item) => getResultStatus(item) === "running").length,
      done:
        result.done ??
        resultRows.every((item) =>
          ["succeeded", "failed"].includes(getResultStatus(item)),
        ),
    });
  }, []);

  const refreshBatchStatus = useCallback(
    async (currentBatchId: string, options: { notifyDone?: boolean } = {}) => {
      const result = await getCoverGenerationBatchStatusAction(currentBatchId);
      if (!result.success) {
        notifyError({
          title: result.errorTitle ?? "读取封面生成状态失败",
          description: result.error ?? "请刷新页面后重试。",
        });
        return;
      }

      applyBatchStatus(result);

      if (result.done && options.notifyDone) {
        notifySuccess({
          title: "后台封面生成完成",
          description: describeAdminResult([
            `成功 ${result.successCount ?? 0} 篇`,
            (result.failedCount ?? 0) > 0
              ? `失败 ${result.failedCount ?? 0} 篇`
              : null,
          ]),
        });
        router.refresh();
      }
    },
    [applyBatchStatus, router],
  );

  useEffect(() => {
    if (!batchId || !isBatchRunning) return;

    let stopped = false;
    let notifiedDone = false;
    const poll = async () => {
      if (stopped) return;

      const result = await getCoverGenerationBatchStatusAction(batchId);
      if (stopped) return;

      if (!result.success) {
        notifyError({
          title: result.errorTitle ?? "读取封面生成状态失败",
          description: result.error ?? "请刷新页面后重试。",
        });
        return;
      }

      applyBatchStatus(result);

      if (result.done && !notifiedDone) {
        notifiedDone = true;
        notifySuccess({
          title: "后台封面生成完成",
          description: describeAdminResult([
            `成功 ${result.successCount ?? 0} 篇`,
            (result.failedCount ?? 0) > 0
              ? `失败 ${result.failedCount ?? 0} 篇`
              : null,
          ]),
        });
        router.refresh();
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [applyBatchStatus, batchId, isBatchRunning, router]);

  async function handleGenerate() {
    if (selectedIds.length === 0) {
      notifyError({
        title: "请选择文章",
        description: "至少选择 1 篇文章后再生成封面。",
      });
      return;
    }

    setIsStarting(true);
    try {
      const result = await batchGenerateArticleCoverImagesAction({
        postIds: selectedIds,
      });

      if (!result.success) {
        notifyError({
          title: result.errorTitle ?? "批量生成封面失败",
          description: result.error ?? "请检查生图接口配置",
        });
        return;
      }

      setBatchId(result.batchId ?? null);
      applyBatchStatus(result);
      notifyInfo({
        title: "已加入后台生成队列",
        description: describeAdminResult([
          `任务 ${result.results?.length ?? selectedIds.length} 篇`,
          "可以停留本页查看进度",
        ]),
      });
      if (result.batchId) {
        await refreshBatchStatus(result.batchId);
      }
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="space-y-5">
      <AdminTableWorkbench
        title="文章封面生成"
        description="批量选择文章后调用生图接口生成对应语言的文章封面，成功后直接写入文章封面。单次最多 20 篇。"
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="搜索标题、slug 或分类"
        selectionCount={selectedIds.length}
        filterSlot={
          <Select
            value={coverFilter}
            onValueChange={(value) =>
              setCoverFilter(value as typeof coverFilter)
            }
          >
            <SelectTrigger className="h-9 w-36 border-0 bg-transparent px-0 shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="missing">无封面</SelectItem>
              <SelectItem value="has-cover">已有封面</SelectItem>
              <SelectItem value="all">全部文章</SelectItem>
            </SelectContent>
          </Select>
        }
        actionSlot={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={selectMissingCovers}
            >
              选择无封面
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={isBusy || selectedIds.length === 0}
              onClick={handleGenerate}
            >
              {isBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              {isStarting
                ? "加入队列..."
                : isBatchRunning
                  ? "后台生成中..."
                  : selectedIds.length > 0
                    ? `生成封面 ${selectedIds.length}`
                    : "选择文章"}
            </Button>
          </div>
        }
      />

      {batchId ? (
        <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">后台批次正在运行</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                批次号：{batchId}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="default">成功 {batchSummary.successCount}</Badge>
              <Badge variant="secondary">
                生成中 {batchSummary.runningCount}
              </Badge>
              <Badge variant="outline">排队 {batchSummary.pendingCount}</Badge>
              <Badge
                variant={
                  batchSummary.failedCount > 0 ? "destructive" : "outline"
                }
              >
                失败 {batchSummary.failedCount}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => refreshBatchStatus(batchId)}
              >
                刷新状态
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedIds.length > 20 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          单次最多选择 20 篇文章。
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="rounded-lg border border-border/70 bg-background p-4">
          <p className="text-sm font-semibold">最近生成结果</p>
          <div className="mt-3 grid gap-2">
            {results.map((result) => (
              <div
                key={result.taskId ?? result.postId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    #{result.postId} {result.title ?? "未命名文章"}
                  </p>
                  {result.success ? (
                    <p className="break-all text-xs text-muted-foreground">
                      {result.url}
                    </p>
                  ) : getResultStatus(result) === "failed" ? (
                    <div className="mt-1 space-y-1 text-xs text-destructive">
                      <p>{result.errorTitle ?? "生成失败"}</p>
                      {result.errorDetail || result.error ? (
                        <p className="break-all text-muted-foreground">
                          {result.errorDetail ?? result.error}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {getResultStatus(result) === "running"
                        ? "正在调用生图接口并保存图片。"
                        : "等待后台任务处理。"}
                    </p>
                  )}
                </div>
                {(() => {
                  const badge = getResultBadge(result);
                  const Icon = badge.icon;
                  return (
                    <Badge variant={badge.variant}>
                      <Icon
                        className={
                          getResultStatus(result) === "running"
                            ? "size-3.5 animate-spin"
                            : "size-3.5"
                        }
                      />
                      {badge.label}
                    </Badge>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border/70 bg-background shadow-sm">
        {filteredPosts.length === 0 ? (
          <AdminTableEmpty
            title="没有匹配的文章"
            description="调整搜索词或筛选条件后再选择文章生成封面。"
          />
        ) : (
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={(checked) =>
                      toggleAllFiltered(Boolean(checked))
                    }
                    aria-label="选择当前筛选文章"
                  />
                </TableHead>
                <TableHead className="min-w-[320px]">文章</TableHead>
                <TableHead className="w-36">封面</TableHead>
                <TableHead className="w-32">状态</TableHead>
                <TableHead className="w-32">更新</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPosts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedSet.has(post.id)}
                      onCheckedChange={(checked) =>
                        toggleSelected(post.id, Boolean(checked))
                      }
                      aria-label={`选择 ${post.title}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="line-clamp-2 font-medium">{post.title}</p>
                        <Badge variant="outline">
                          {post.categoryName ?? "未分类"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {post.slug}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {post.imgUrl ? (
                      <div className="relative h-14 w-24 overflow-hidden rounded-md border border-border/70">
                        <Image
                          src={post.imgUrl}
                          alt={post.title}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <span className="inline-flex h-14 w-24 items-center justify-center rounded-md border border-dashed border-border/70 text-xs text-muted-foreground">
                        无封面
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={post.published ? "default" : "secondary"}>
                        {post.published ? "已发布" : "草稿"}
                      </Badge>
                      {post.imgUrl ? (
                        <Badge variant="outline">已有封面</Badge>
                      ) : (
                        <Badge variant="destructive">待生成</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatTime(post.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/posts/edit/post/${post.slug}`}
                        aria-label={`编辑文章 ${post.title}`}
                      >
                        <ExternalLink className="size-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {selectedWithoutCoverCount < selectedIds.length ? (
        <p className="text-xs leading-5 text-muted-foreground">
          已选文章中包含已有封面的文章，生成成功后会覆盖原封面。
        </p>
      ) : null}
    </div>
  );
}
