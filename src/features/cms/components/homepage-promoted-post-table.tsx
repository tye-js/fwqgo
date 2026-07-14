"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  addHomepagePromotedPost,
  deleteHomepagePromotedPost,
  deleteHomepagePromotedPosts,
  updateHomepagePromotedPost,
} from "@/features/cms/actions/homepage-promoted-post";
import {
  AdminTableEmpty,
  AdminTableWorkbench,
} from "@/features/cms/components/admin-table-workbench";
import { useUrlQueryUpdater } from "@/features/cms/hooks/use-url-query-updater";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { type HomepagePromotedPostItem } from "@/types";

type PublishedPostOption = {
  id: number;
  title: string;
  slug: string;
  language: string;
};

function getActionErrorMessage(result: { error?: string; message?: unknown }) {
  if (!result.error) {
    return null;
  }

  if (typeof result.message === "string" && result.message.trim()) {
    return `${result.error}：${result.message}`;
  }

  return result.error;
}

function parseIntegerInput(value: string) {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function HomepagePromotedPostTable({
  data,
  postOptions,
  language = "zh",
  initialQuery = "",
  initialSort = "sortOrder-asc",
}: {
  data: HomepagePromotedPostItem[];
  postOptions: PublishedPostOption[];
  language?: "zh" | "en";
  initialQuery?: string;
  initialSort?: string;
}) {
  const router = useRouter();
  const updateUrlQuery = useUrlQueryUpdater();
  const [query, setQuery] = useState(initialQuery);
  const sortValue = initialSort;
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [newPostId, setNewPostId] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("0");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSortOrder, setEditingSortOrder] = useState("");
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const filteredData = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return data.filter((item) => {
      if (!normalizedQuery) return true;

      const title = item.post?.title ?? "";
      const slug = item.post?.slug ?? "";

      return (
        title.toLowerCase().includes(normalizedQuery) ||
        slug.toLowerCase().includes(normalizedQuery) ||
        String(item.postId).includes(normalizedQuery)
      );
    });
  }, [data, query]);

  const sortedData = useMemo(() => {
    const [sortKey, sortDirection] = sortValue.split("-");
    const direction = sortDirection === "asc" ? 1 : -1;
    const result = [...filteredData];

    result.sort((left, right) => {
      if (sortKey === "title") {
        return (
          (left.post?.title ?? "").localeCompare(right.post?.title ?? "") *
          direction
        );
      }

      if (sortKey === "postId") {
        return (left.postId - right.postId) * direction;
      }

      return (left.sortOrder - right.sortOrder) * direction;
    });

    return result;
  }, [filteredData, sortValue]);

  const allFilteredSelected =
    sortedData.length > 0 &&
    sortedData.every((item) => selectedIds.includes(item.id));

  useEffect(() => {
    const normalizedInitialQuery = initialQuery.trim();
    const normalizedQuery = query.trim();
    if (normalizedQuery === normalizedInitialQuery) return;

    const timeoutId = window.setTimeout(() => {
      updateUrlQuery({ query: normalizedQuery || null });
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [initialQuery, query, updateUrlQuery]);

  async function handleAdd() {
    const postId = parseIntegerInput(newPostId);
    const sortOrder = parseIntegerInput(newSortOrder);

    if (postId === null || sortOrder === null) {
      toast.error("请填写正确的文章 ID 和排序值");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await addHomepagePromotedPost({
        postId,
        sortOrder,
        language,
      });

      const errorMessage = getActionErrorMessage(result);
      if (errorMessage) {
        toast.error(errorMessage);
        return;
      }

      toast.success("首页推荐文章已保存");
      setNewPostId("");
      setNewSortOrder("0");
      router.refresh();
    } catch (error) {
      toast.error("首页推荐文章保存失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdate(id: number) {
    const sortOrder = parseIntegerInput(editingSortOrder);

    if (sortOrder === null) {
      toast.error("请输入正确的排序值");
      return;
    }

    const result = await updateHomepagePromotedPost({
      id,
      sortOrder,
      language,
    });
    const errorMessage = getActionErrorMessage(result);
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    toast.success("排序已更新");
    setEditingId(null);
    setEditingSortOrder("");
    router.refresh();
  }

  async function handleDelete(id: number) {
    const result = await deleteHomepagePromotedPost(id, language);
    const errorMessage = getActionErrorMessage(result);
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    toast.success("首页推荐文章已删除");
    setSelectedIds((prev) => prev.filter((item) => item !== id));
    router.refresh();
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) {
      toast.error("请先选择推荐文章");
      return;
    }

    setIsBulkDeleting(true);
    try {
      const result = await deleteHomepagePromotedPosts(selectedIds, language);

      const errorMessage = getActionErrorMessage(result);
      if (errorMessage) {
        toast.error(errorMessage);
        return;
      }

      toast.success(`已删除 ${selectedIds.length} 个推荐位`);
      setSelectedIds([]);
      router.refresh();
    } catch (error) {
      toast.error("批量删除推荐位失败", {
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsBulkDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <AdminTableWorkbench
        title="推荐位工作台"
        description={`当前维护${language === "en" ? "英文" : "中文"}首页推荐，支持搜索文章标题、slug 或文章 ID，并可批量移除推荐位。`}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="搜索标题、slug 或文章 ID"
        selectionCount={selectedIds.length}
        filterSlot={
          <Select
            value={sortValue}
            onValueChange={(value) =>
              updateUrlQuery({
                query: query.trim() || null,
                sort: value === "sortOrder-asc" ? null : value,
              })
            }
          >
            <SelectTrigger className="min-h-11 w-full border-border/70 bg-background shadow-none focus:ring-0 sm:w-[180px] sm:border-0 sm:bg-transparent sm:px-0">
              <SelectValue placeholder="排序方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sortOrder-asc">排序值从小到大</SelectItem>
              <SelectItem value="sortOrder-desc">排序值从大到小</SelectItem>
              <SelectItem value="postId-desc">文章 ID 从大到小</SelectItem>
              <SelectItem value="title-asc">标题 A-Z</SelectItem>
            </SelectContent>
          </Select>
        }
        actionSlot={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={selectedIds.length === 0 || isBulkDeleting}
              >
                <Trash2 className="size-4" />
                {isBulkDeleting ? "删除中..." : "批量删除"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>移除选中的首页推荐位？</AlertDialogTitle>
                <AlertDialogDescription>
                  将移除 {selectedIds.length} 个推荐位，不会删除对应文章。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleBulkDelete}>
                  确认移除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />

      <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-3">
        <p className="text-sm font-medium text-foreground">添加推荐文章</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          通过文章 ID 把已发布的{language === "en" ? "英文" : "中文"}
          文章加入首页右侧“站长推荐”区域，排序值越小越靠前。
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(240px,1fr)_minmax(150px,0.45fr)_120px_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="homepage-promoted-post-option">
              最近已发布文章
            </Label>
            <Select
              value={
                postOptions.some((post) => String(post.id) === newPostId)
                  ? newPostId
                  : undefined
              }
              onValueChange={setNewPostId}
            >
              <SelectTrigger id="homepage-promoted-post-option">
                <SelectValue placeholder="选择最近 100 篇文章" />
              </SelectTrigger>
              <SelectContent>
                {postOptions.map((post) => (
                  <SelectItem key={post.id} value={String(post.id)}>
                    #{post.id} {post.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="homepage-promoted-post-id">文章 ID</Label>
            <Input
              id="homepage-promoted-post-id"
              inputMode="numeric"
              value={newPostId}
              onChange={(event) => setNewPostId(event.target.value)}
              placeholder="也可手填 ID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="homepage-promoted-sort-order">排序值</Label>
            <Input
              id="homepage-promoted-sort-order"
              type="number"
              value={newSortOrder}
              onChange={(event) => setNewSortOrder(event.target.value)}
              placeholder="0"
            />
          </div>
          <Button disabled={isSubmitting} onClick={handleAdd}>
            {isSubmitting ? "保存中..." : "保存推荐位"}
          </Button>
          {postOptions.length === 0 ? (
            <p className="text-xs leading-5 text-muted-foreground md:col-span-4">
              当前语言下没有可选的已发布文章，也可以直接填写已发布文章 ID。
            </p>
          ) : null}
        </div>
      </div>

      {sortedData.length === 0 ? (
        <AdminTableEmpty
          title="没有匹配的推荐文章"
          description="试试更换关键词，或者从上面的最近可选文章里重新选择。"
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[44px]">
                  <Checkbox
                    aria-label="全选当前筛选推荐文章"
                    checked={allFilteredSelected}
                    onCheckedChange={(checked) =>
                      setSelectedIds(
                        Boolean(checked)
                          ? sortedData.map((item) => item.id)
                          : [],
                      )
                    }
                  />
                </TableHead>
                <TableHead>ID</TableHead>
                <TableHead>文章</TableHead>
                <TableHead className="w-[140px]">文章 ID</TableHead>
                <TableHead className="w-[120px]">排序</TableHead>
                <TableHead className="w-[180px] text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Checkbox
                      aria-label={`选择推荐位 ${item.post?.title ?? item.postId}`}
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={(checked) =>
                        setSelectedIds((prev) =>
                          Boolean(checked)
                            ? [...prev, item.id]
                            : prev.filter((id) => id !== item.id),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>{item.id}</TableCell>
                  <TableCell>
                    {item.post ? (
                      <div className="space-y-1">
                        <Link
                          href={`/posts/edit/post/${encodeURIComponent(item.post.slug)}`}
                          className="font-medium transition-colors hover:text-accent"
                        >
                          {item.post.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {item.post.published ? "已发布" : "未发布"} /{" "}
                          {item.post.language === "en" ? "英文" : "中文"}
                        </p>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        文章不存在
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{item.postId}</TableCell>
                  <TableCell>
                    {editingId === item.id ? (
                      <Input
                        value={editingSortOrder}
                        onChange={(event) =>
                          setEditingSortOrder(event.target.value)
                        }
                        className="min-h-11"
                      />
                    ) : (
                      item.sortOrder
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-2">
                      {editingId === item.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEditingId(null);
                              setEditingSortOrder("");
                            }}
                          >
                            取消
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleUpdate(item.id)}
                          >
                            保存
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingId(item.id);
                              setEditingSortOrder(String(item.sortOrder));
                            }}
                          >
                            排序
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive">
                                删除
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  移除这个首页推荐位？
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  只会移除推荐位，不会删除文章“
                                  {item.post?.title ?? `#${item.postId}`}”。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(item.id)}
                                >
                                  确认移除
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
      )}
    </div>
  );
}
