"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  CircleCheck,
  CircleX,
  FileSearch,
  ImagePlus,
  Languages,
  SearchCheck,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  bulkUpdatePostsPublishedAction,
  deletePostById,
  deletePostsByIds,
  updatePost,
} from "@/features/cms/actions/post";
import {
  batchGenerateArticleCoverImagesAction,
  getCoverGenerationBatchStatusAction,
} from "@/features/cms/actions/article-cover-image";
import {
  bulkEnqueueEnglishVersionsForPostsAction,
  enqueueSeoUpdateForPostsAction,
} from "@/features/cms/actions/ai-rewrite-task";
import {
  getServerOfferImportTaskStatusAction,
  importServerOffersFromSelectedPostsAction,
  importServerOffersFromPostAction,
} from "@/features/cms/actions/server-offers";
import {
  describeAdminResult,
  notifyActionError,
  notifyInfo,
} from "@/lib/admin-toast";
import {
  AdminTableEmpty,
  AdminTableWorkbench,
} from "@/features/cms/components/admin-table-workbench";
import { ImageLibraryPicker } from "@/features/cms/components/image-library-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { type posts } from "@fwqgo/db/schema";

type Post = typeof posts.$inferSelect;
type PostListProp = Pick<
  Post,
  "id" | "title" | "published" | "imgUrl" | "slug" | "language"
>;
type PostStatusFilter = "all" | "published" | "draft";
type ImportStats = {
  scannedPosts: number;
  extracted: number;
  inserted: number;
  updated: number;
  skipped: number;
};

function describeImportStats(data: ImportStats) {
  return `扫描 ${data.scannedPosts} 篇，提取 ${data.extracted} 条，新增 ${data.inserted} 条，更新 ${data.updated} 条，跳过 ${data.skipped} 条`;
}

type ImportTask = {
  taskId: number;
  postId: number | null;
  status: "pending" | "running" | "succeeded" | "failed";
  progress: number;
  message: string | null;
  result: ImportStats | null;
  done: boolean;
  errorTitle?: string;
  errorDetail?: string;
};

type BulkAction =
  | "publish"
  | "draft"
  | "cover"
  | "english"
  | "seo"
  | "offers"
  | "delete";

type CoverBatch = {
  batchId: string;
  pendingCount: number;
  runningCount: number;
  successCount: number;
  failedCount: number;
  done?: boolean;
};

function languageLabel(value: string) {
  return value === "en" ? "英文" : "中文";
}

export function PostList({
  posts,
  editBasePath,
  defaultStatusFilter = "all",
}: {
  posts: PostListProp[];
  editBasePath?: string;
  defaultStatusFilter?: PostStatusFilter;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(defaultStatusFilter);
  const [sortValue, setSortValue] = useState("id-desc");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editPostId, setEditPostId] = useState<number | null>(null);
  const [editPostData, setEditPostData] = useState<PostListProp | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [extractingPostId, setExtractingPostId] = useState<number | null>(null);
  const [activeImportTask, setActiveImportTask] = useState<ImportTask | null>(
    null,
  );
  const [activeCoverBatch, setActiveCoverBatch] =
    useState<CoverBatch | null>(null);

  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return posts.filter((post) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        post.title.toLowerCase().includes(normalizedQuery) ||
        post.slug.toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "published" && post.published) ||
        (statusFilter === "draft" && !post.published);

      return matchesQuery && matchesStatus;
    });
  }, [posts, query, statusFilter]);

  const sortedPosts = useMemo(() => {
    const [sortKey, sortDirection] = sortValue.split("-");
    const direction = sortDirection === "asc" ? 1 : -1;
    const result = [...filteredPosts];

    result.sort((left, right) => {
      if (sortKey === "title") {
        return left.title.localeCompare(right.title) * direction;
      }

      if (sortKey === "slug") {
        return left.slug.localeCompare(right.slug) * direction;
      }

      if (sortKey === "published") {
        return (Number(left.published) - Number(right.published)) * direction;
      }

      return (left.id - right.id) * direction;
    });

    return result;
  }, [filteredPosts, sortValue]);

  const allFilteredSelected =
    sortedPosts.length > 0 &&
    sortedPosts.every((post) => selectedIds.includes(post.id));

  useEffect(() => {
    if (!activeImportTask || activeImportTask.done) return;

    let stopped = false;
    const poll = async () => {
      const result = await getServerOfferImportTaskStatusAction(
        activeImportTask.taskId,
      );
      if (stopped) return;

      if (!result.success) {
        notifyActionError(result, {
          fallbackSuggestion: "请刷新页面后重试。",
        });
        return;
      }

      setActiveImportTask(result.data);
      if (!result.data.done) {
        return;
      }

      setExtractingPostId(null);
      if (result.data.status === "succeeded" && result.data.result) {
        toast.success("套餐数据提取完成", {
          description: describeImportStats(result.data.result),
        });
        router.refresh();
        return;
      }

      notifyActionError(
        {
          errorTitle: result.data.errorTitle ?? "套餐提取失败",
          message: result.data.errorDetail ?? "请查看服务器日志。",
        },
        { fallbackSuggestion: "修正文章内容或提取规则后可以重新提交任务。" },
      );
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeImportTask, router]);

  useEffect(() => {
    if (!activeCoverBatch || activeCoverBatch.done) return;

    let stopped = false;
    const poll = async () => {
      const result = await getCoverGenerationBatchStatusAction(
        activeCoverBatch.batchId,
      );
      if (stopped) return;

      if (!result.success) {
        notifyActionError(result, {
          fallbackSuggestion: "请刷新页面后重试，或到图片管理里查看封面任务。",
        });
        return;
      }

      setActiveCoverBatch({
        batchId: result.batchId ?? activeCoverBatch.batchId,
        pendingCount: result.pendingCount ?? 0,
        runningCount: result.runningCount ?? 0,
        successCount: result.successCount ?? 0,
        failedCount: result.failedCount ?? 0,
        done: Boolean(result.done),
      });

      if (!result.done) {
        return;
      }

      const description = describeAdminResult([
        `成功 ${result.successCount ?? 0} 张`,
        (result.failedCount ?? 0) > 0
          ? `失败 ${result.failedCount ?? 0} 张`
          : null,
      ]);

      if ((result.failedCount ?? 0) > 0) {
        toast.warning("批量封面生成已结束，部分失败", { description });
      } else {
        toast.success("批量封面生成完成", { description });
      }
      router.refresh();
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeCoverBatch, router]);

  async function handleDelete(id: number) {
    try {
      const { error } = await deletePostById(id);
      if (error) {
        toast.error("删除文章失败");
        return;
      }

      toast.success("删除文章成功");
      setSelectedIds((prev) => prev.filter((item) => item !== id));
      router.refresh();
    } catch (error) {
      toast.error("删除文章失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) {
      toast.error("请先选择文章");
      return;
    }

    setBulkAction("delete");
    try {
      const { error } = await deletePostsByIds(selectedIds);

      if (error) {
        toast.error("批量删除文章失败");
        return;
      }

      toast.success(`已删除 ${selectedIds.length} 篇文章`);
      setSelectedIds([]);
      router.refresh();
    } catch (error) {
      toast.error("批量删除文章失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setBulkAction(null);
    }
  }

  async function handleBulkPublished(published: boolean) {
    if (selectedIds.length === 0) {
      toast.error("请先选择文章");
      return;
    }

    setBulkAction(published ? "publish" : "draft");
    try {
      const result = await bulkUpdatePostsPublishedAction({
        ids: selectedIds,
        published,
      });

      if (result.error) {
        toast.error(result.error, {
          description:
            typeof result.message === "string" ? result.message : "请稍后重试。",
        });
        return;
      }

      if (!result.data) {
        toast.error("批量操作没有返回结果", {
          description: "请刷新页面后确认文章状态。",
        });
        return;
      }

      const stats = result.data;
      const description = describeAdminResult([
        `处理 ${stats.requested} 篇`,
        `更新 ${stats.updated} 篇`,
        stats.unchanged > 0 ? `跳过 ${stats.unchanged} 篇` : null,
        stats.blocked > 0 ? `返利审计拦截 ${stats.blocked} 篇` : null,
        stats.failed > 0 ? `失败 ${stats.failed} 篇` : null,
        stats.blockedHosts.length > 0
          ? `需补规则：${stats.blockedHosts.slice(0, 5).join(", ")}`
          : null,
      ]);

      if (stats.blocked > 0 || stats.failed > 0) {
        toast.warning(published ? "批量发布已处理，部分未发布" : "批量转草稿已处理", {
          description,
        });
      } else {
        toast.success(published ? "批量发布完成" : "批量转草稿完成", {
          description,
        });
        setSelectedIds([]);
      }

      router.refresh();
    } catch (error) {
      toast.error(published ? "批量发布失败" : "批量转草稿失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setBulkAction(null);
    }
  }

  async function handleBulkGenerateCovers() {
    if (selectedIds.length === 0) {
      toast.error("请先选择文章");
      return;
    }

    setBulkAction("cover");
    try {
      const result = await batchGenerateArticleCoverImagesAction({
        postIds: selectedIds,
      });

      if (!result.success) {
        notifyActionError(result, {
          fallbackSuggestion: "单次最多选择 20 篇文章，请减少选择后重试。",
        });
        return;
      }

      if (!result.batchId) {
        notifyActionError(
          { error: "封面生成任务没有返回批次号" },
          { fallbackSuggestion: "请刷新页面后重试。" },
        );
        return;
      }

      setActiveCoverBatch({
        batchId: result.batchId,
        pendingCount: result.pendingCount ?? 0,
        runningCount: result.runningCount ?? 0,
        successCount: result.successCount ?? 0,
        failedCount: result.failedCount ?? 0,
        done: false,
      });
      notifyInfo({
        title: "批量封面生成已加入后台队列",
        description: describeAdminResult([
          `批次 ${result.batchId}`,
          `排队 ${result.pendingCount ?? 0} 篇`,
        ]),
      });
      setSelectedIds([]);
    } catch (error) {
      toast.error("批量生成封面失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setBulkAction(null);
    }
  }

  async function handleBulkEnglish() {
    if (selectedIds.length === 0) {
      toast.error("请先选择文章");
      return;
    }

    setBulkAction("english");
    try {
      const result = await bulkEnqueueEnglishVersionsForPostsAction(selectedIds);

      if (result.error) {
        toast.error("批量生成英文失败", {
          description: result.error,
        });
        return;
      }

      if (!result.data) {
        toast.error("批量生成英文没有返回结果", {
          description: "请到 AI 任务中心确认任务是否已创建。",
        });
        return;
      }

      const stats = result.data;
      toast.success("英文生成任务已加入 AI 任务中心", {
        description: describeAdminResult([
          `处理 ${stats.requested} 篇`,
          `排队 ${stats.queued} 个任务`,
          stats.skipped > 0 ? `跳过 ${stats.skipped} 篇` : null,
          stats.failed > 0 ? `失败 ${stats.failed} 个` : null,
        ]),
      });
      if (stats.failed === 0) {
        setSelectedIds([]);
      }
      router.refresh();
    } catch (error) {
      toast.error("批量生成英文失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setBulkAction(null);
    }
  }

  async function handleBulkSeo() {
    if (selectedIds.length === 0) {
      toast.error("请先选择文章");
      return;
    }

    setBulkAction("seo");
    try {
      const result = await enqueueSeoUpdateForPostsAction(selectedIds);

      if (result.error) {
        toast.error("批量更新 SEO 失败", {
          description: result.error,
        });
        return;
      }

      if (!result.data) {
        toast.error("批量更新 SEO 没有返回结果", {
          description: "请到 AI 任务中心确认任务是否已创建。",
        });
        return;
      }

      const stats = result.data;
      toast.success("SEO 更新任务已加入 AI 任务中心", {
        description: describeAdminResult([
          `处理 ${stats.requested} 篇`,
          `排队 ${stats.queued} 个任务`,
          stats.running > 0 ? `运行中 ${stats.running} 个` : null,
          stats.skipped > 0 ? `跳过 ${stats.skipped} 篇` : null,
          stats.failed > 0 ? `失败 ${stats.failed} 个` : null,
        ]),
      });
      if (stats.failed === 0) {
        setSelectedIds([]);
      }
      router.refresh();
    } catch (error) {
      toast.error("批量更新 SEO 失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setBulkAction(null);
    }
  }

  async function handleBulkExtractOffers() {
    if (selectedIds.length === 0) {
      toast.error("请先选择文章");
      return;
    }

    setBulkAction("offers");
    try {
      const result = await importServerOffersFromSelectedPostsAction(
        selectedIds,
      );

      if (!result.success) {
        notifyActionError(result);
        return;
      }

      toast.success("批量套餐提取已加入后台队列", {
        description: describeAdminResult([
          `处理 ${result.data.requested} 篇`,
          `排队 ${result.data.queued} 个任务`,
          result.data.failed > 0 ? `失败 ${result.data.failed} 个` : null,
        ]),
      });
      if (result.data.failed === 0) {
        setSelectedIds([]);
      }
      router.refresh();
    } catch (error) {
      toast.error("批量提取套餐失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setBulkAction(null);
    }
  }

  function handleInputChange(
    key: keyof PostListProp,
    value: string | boolean | null,
  ) {
    setEditPostData((prev) => {
      if (!prev) return null;
      return { ...prev, [key]: value };
    });
  }

  async function handleSave(postId: number) {
    if (editPostData?.id !== postId) return;
    setIsSaving(true);
    try {
      const { error, message } = await updatePost({ ...editPostData });

      if (error) {
        toast.error(error, {
          description:
            typeof message === "string" ? message : "请检查文章信息后再保存。",
        });
        return;
      }

      toast.success("更新文章成功");
      setEditPostId(null);
      router.refresh();
    } catch (error) {
      toast.error("更新文章失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExtractOffers(postId: number) {
    setExtractingPostId(postId);

    try {
      const result = await importServerOffersFromPostAction(postId);
      if (!result.success) {
        setExtractingPostId(null);
        notifyActionError(result);
        return;
      }

      setActiveImportTask(result.data);
      notifyInfo({
        title: "套餐提取已加入后台队列",
        description: describeAdminResult([
          `任务 ID ${result.data.taskId}`,
          "后台会解析文章表格、正文段落和购买链接",
        ]),
      });
    } catch (error) {
      setExtractingPostId(null);
      notifyActionError(
        {
          error: "套餐提取任务创建失败",
          message: error instanceof Error ? error.message : "请稍后重试。",
        },
        { fallbackSuggestion: "请确认登录状态和文章是否存在。" },
      );
    }
  }

  function toggleSelection(id: number, checked: boolean) {
    setSelectedIds((prev) =>
      checked
        ? [...new Set([...prev, id])]
        : prev.filter((item) => item !== id),
    );
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? sortedPosts.map((post) => post.id) : []);
  }

  const bulkDisabled = selectedIds.length === 0 || bulkAction !== null;

  return (
    <div className="space-y-4">
      <AdminTableWorkbench
        title="文章工作台"
        description="支持搜索、筛选、批量发布/转草稿、生成封面、生成英文、更新 SEO、提取套餐和删除文章。"
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="搜索文章标题或 slug"
        selectionCount={selectedIds.length}
        filterSlot={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as PostStatusFilter)
              }
            >
              <SelectTrigger className="min-h-11 w-full border-border/70 bg-background shadow-none focus:ring-0 sm:w-[132px] sm:border-0 sm:bg-transparent sm:px-0">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="published">已发布</SelectItem>
                <SelectItem value="draft">草稿</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortValue} onValueChange={setSortValue}>
              <SelectTrigger className="min-h-11 w-full border-border/70 bg-background shadow-none focus:ring-0 sm:w-[152px] sm:border-0 sm:bg-transparent sm:px-0">
                <SelectValue placeholder="排序方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id-desc">ID 从新到旧</SelectItem>
                <SelectItem value="id-asc">ID 从旧到新</SelectItem>
                <SelectItem value="title-asc">标题 A-Z</SelectItem>
                <SelectItem value="slug-asc">Slug A-Z</SelectItem>
                <SelectItem value="published-desc">已发布优先</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        actionSlot={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto xl:justify-end">
            <Button
              variant="outline"
              disabled={bulkDisabled}
              onClick={() => handleBulkPublished(true)}
              className="min-h-11 w-full sm:w-auto"
            >
              <Send className="size-4" />
              {bulkAction === "publish" ? "发布中..." : "批量发布"}
            </Button>
            <Button
              variant="outline"
              disabled={bulkDisabled}
              onClick={() => handleBulkPublished(false)}
              className="min-h-11 w-full sm:w-auto"
            >
              <Archive className="size-4" />
              {bulkAction === "draft" ? "处理中..." : "转草稿"}
            </Button>
            <Button
              variant="outline"
              disabled={bulkDisabled}
              onClick={handleBulkGenerateCovers}
              className="min-h-11 w-full sm:w-auto"
            >
              <ImagePlus className="size-4" />
              {bulkAction === "cover" ? "排队中..." : "生成封面"}
            </Button>
            <Button
              variant="outline"
              disabled={bulkDisabled}
              onClick={handleBulkEnglish}
              className="min-h-11 w-full sm:w-auto"
            >
              <Languages className="size-4" />
              {bulkAction === "english" ? "排队中..." : "生成英文"}
            </Button>
            <Button
              variant="outline"
              disabled={bulkDisabled}
              onClick={handleBulkSeo}
              className="min-h-11 w-full sm:w-auto"
            >
              <SearchCheck className="size-4" />
              {bulkAction === "seo" ? "排队中..." : "更新 SEO"}
            </Button>
            <Button
              variant="outline"
              disabled={bulkDisabled}
              onClick={handleBulkExtractOffers}
              className="min-h-11 w-full sm:w-auto"
            >
              <FileSearch className="size-4" />
              {bulkAction === "offers" ? "排队中..." : "提取套餐"}
            </Button>
            <Button
              variant="destructive"
              disabled={bulkDisabled}
              onClick={handleBulkDelete}
              className="min-h-11 w-full sm:w-auto"
            >
              <Trash2 className="size-4" />
              {bulkAction === "delete" ? "删除中..." : "批量删除"}
            </Button>
          </div>
        }
      />

      {activeCoverBatch && !activeCoverBatch.done ? (
        <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
          封面批次 {activeCoverBatch.batchId} 正在后台处理：
          成功 {activeCoverBatch.successCount}，运行{" "}
          {activeCoverBatch.runningCount}，排队 {activeCoverBatch.pendingCount}
          ，失败 {activeCoverBatch.failedCount}
        </div>
      ) : null}

      {sortedPosts.length === 0 ? (
        <AdminTableEmpty
          title="没有匹配的文章"
          description="试试更换关键词，或者切换发布状态筛选。"
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {sortedPosts.map((post) => (
              <article
                key={post.id}
                className="rounded-md border border-border/70 bg-card p-3 shadow-none"
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedIds.includes(post.id)}
                    onCheckedChange={(checked) =>
                      toggleSelection(post.id, Boolean(checked))
                    }
                    aria-label={`选择文章 ${post.title}`}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        ID {post.id}
                      </span>
                      <span className="rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {languageLabel(post.language)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {post.published ? (
                          <CircleCheck className="size-3.5 text-primary" />
                        ) : (
                          <CircleX className="size-3.5" />
                        )}
                        {post.published ? "已发布" : "草稿"}
                      </span>
                    </div>

                    {editPostId === post.id ? (
                      <div className="space-y-2">
                        <Input
                          className="min-h-11"
                          autoFocus
                          value={editPostData?.title ?? ""}
                          onChange={(e) =>
                            handleInputChange("title", e.target.value)
                          }
                        />
                        <Input
                          className="min-h-11"
                          value={editPostData?.slug ?? ""}
                          onChange={(e) =>
                            handleInputChange("slug", e.target.value)
                          }
                        />
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={editPostData?.published ?? false}
                            onCheckedChange={(checked) =>
                              handleInputChange("published", Boolean(checked))
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            发布文章
                          </span>
                        </div>
                        <div className="grid gap-2">
                          <Input
                            className="min-h-11"
                            value={editPostData?.imgUrl ?? ""}
                            onChange={(e) =>
                              handleInputChange("imgUrl", e.target.value)
                            }
                          />
                          <ImageLibraryPicker
                            triggerLabel="从图片库选择"
                            onSelect={(value) =>
                              handleInputChange("imgUrl", value)
                            }
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <Link
                          href={`${editBasePath ?? pathname}/post/${post.slug}`}
                          className="line-clamp-2 text-base font-medium leading-6 text-foreground underline-offset-4 hover:text-accent hover:underline"
                        >
                          {post.title}
                        </Link>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {post.slug}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {post.imgUrl ?? "未设置封面"}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {editPostId === post.id ? (
                    <>
                      <Button
                        variant="secondary"
                        className="min-h-11"
                        onClick={() => setEditPostId(null)}
                      >
                        取消
                      </Button>
                      <Button
                        className="min-h-11"
                        disabled={isSaving}
                        onClick={() => handleSave(post.id)}
                      >
                        {isSaving ? "保存中..." : "保存"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={extractingPostId === post.id}
                        onClick={() => handleExtractOffers(post.id)}
                      >
                        <FileSearch className="size-4" />
                        {extractingPostId === post.id
                          ? "提取中..."
                          : "提取套餐"}
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-11"
                        onClick={() => {
                          setEditPostId(post.id);
                          setEditPostData(post);
                        }}
                      >
                        编辑
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            className="col-span-2 min-h-11"
                          >
                            删除
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              确定删除这篇文章吗？
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              删除后将无法恢复，当前文章为
                              <span className="mt-2 block text-red-500">
                                {post.title}
                              </span>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(post.id)}
                            >
                              确定删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-md border border-border/70 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={(checked) =>
                        toggleSelectAll(Boolean(checked))
                      }
                      aria-label="全选当前筛选结果"
                    />
                  </TableHead>
                  <TableHead className="w-[64px]">ID</TableHead>
                  <TableHead className="text-nowrap">语言</TableHead>
                  <TableHead className="text-nowrap">标题</TableHead>
                  <TableHead className="text-nowrap">slug</TableHead>
                  <TableHead className="text-nowrap text-center">
                    发布
                  </TableHead>
                  <TableHead className="text-nowrap">封面</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPosts.map((post) => (
                  <TableRow key={post.id} className="text-xs hover:bg-muted/30">
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(post.id)}
                        onCheckedChange={(checked) =>
                          toggleSelection(post.id, Boolean(checked))
                        }
                        aria-label={`选择文章 ${post.title}`}
                      />
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {post.id}
                    </TableCell>
                    <TableCell className="text-nowrap">
                      <span className="rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {languageLabel(post.language)}
                      </span>
                    </TableCell>
                    <TableCell className="min-w-[220px] max-w-[360px]">
                      {editPostId === post.id ? (
                        <Input
                          className="min-h-11"
                          autoFocus
                          value={editPostData?.title ?? ""}
                          onChange={(e) =>
                            handleInputChange("title", e.target.value)
                          }
                        />
                      ) : (
                        <span className="line-clamp-2 text-sm leading-5">
                          {post.title}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-nowrap">
                      {editPostId === post.id ? (
                        <Input
                          className="min-h-11"
                          value={editPostData?.slug ?? ""}
                          onChange={(e) =>
                            handleInputChange("slug", e.target.value)
                          }
                        />
                      ) : (
                        <Link
                          href={`${editBasePath ?? pathname}/post/${post.slug}`}
                          className="font-medium transition-colors hover:text-accent"
                        >
                          {post.slug}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="p-0 text-center">
                      {editPostId === post.id ? (
                        <Checkbox
                          className="h-5 w-5 rounded-full"
                          checked={editPostData?.published ?? false}
                          onCheckedChange={(checked) =>
                            handleInputChange("published", Boolean(checked))
                          }
                        />
                      ) : post.published ? (
                        <CircleCheck
                          className="mx-auto text-primary"
                          size={20}
                        />
                      ) : (
                        <CircleX
                          className="mx-auto text-muted-foreground"
                          size={20}
                        />
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] text-nowrap">
                      {editPostId === post.id ? (
                        <div className="grid min-w-[240px] gap-2 xl:grid-cols-[minmax(180px,1fr)_auto]">
                          <Input
                            className="min-h-11"
                            value={editPostData?.imgUrl ?? ""}
                            onChange={(e) =>
                              handleInputChange("imgUrl", e.target.value)
                            }
                          />
                          <ImageLibraryPicker
                            triggerLabel="选择"
                            onSelect={(value) =>
                              handleInputChange("imgUrl", value)
                            }
                          />
                        </div>
                      ) : (
                        <span className="block truncate text-muted-foreground">
                          {post.imgUrl ?? "-"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1.5">
                        {editPostId === post.id ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="px-2"
                              onClick={() => setEditPostId(null)}
                            >
                              取消
                            </Button>
                            <Button
                              size="sm"
                              className="px-2"
                              disabled={isSaving}
                              onClick={() => handleSave(post.id)}
                            >
                              {isSaving ? "保存中..." : "保存"}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="px-2"
                              disabled={extractingPostId === post.id}
                              onClick={() => handleExtractOffers(post.id)}
                            >
                              <FileSearch className="size-4" />
                              {extractingPostId === post.id
                                ? "提取中..."
                                : "提取套餐"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="px-2"
                              onClick={() => {
                                setEditPostId(post.id);
                                setEditPostData(post);
                              }}
                            >
                              编辑
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="px-2"
                                >
                                  删除
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    确定删除这篇文章吗？
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    删除后将无法恢复，当前文章为
                                    <span className="mt-2 block text-red-500">
                                      {post.title}
                                    </span>
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(post.id)}
                                  >
                                    确定删除
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
