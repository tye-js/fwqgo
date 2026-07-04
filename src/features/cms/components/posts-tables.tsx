"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleCheck, CircleX, FileSearch, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deletePostById, deletePostsByIds, updatePost } from "@/features/cms/actions/post";
import { importServerOffersFromPostAction } from "@/features/cms/actions/server-offers";
import { AdminTableEmpty, AdminTableWorkbench } from "@/features/cms/components/admin-table-workbench";
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
  "id" | "title" | "published" | "imgUrl" | "slug"
>;
type PostStatusFilter = "all" | "published" | "draft";
type ImportStats = {
  scannedPosts: number;
  extracted: number;
  inserted: number;
  skipped: number;
};

function describeImportStats(data: ImportStats) {
  return `扫描 ${data.scannedPosts} 篇，提取 ${data.extracted} 条，新增 ${data.inserted} 条，跳过 ${data.skipped} 条`;
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
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [extractingPostId, setExtractingPostId] = useState<number | null>(null);

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

  async function handleDelete(id: number) {
    const { error } = await deletePostById(id);
    if (error) {
      toast.error("删除文章失败");
      return;
    }

    toast.success("删除文章成功");
    setSelectedIds((prev) => prev.filter((item) => item !== id));
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) {
      toast.error("请先选择文章");
      return;
    }

    setIsBulkDeleting(true);
    const { error } = await deletePostsByIds(selectedIds);
    setIsBulkDeleting(false);

    if (error) {
      toast.error("批量删除文章失败");
      return;
    }

    toast.success(`已删除 ${selectedIds.length} 篇文章`);
    setSelectedIds([]);
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
    const { error, message } = await updatePost({ ...editPostData });
    setIsSaving(false);

    if (error) {
      toast.error(error, {
        description:
          typeof message === "string" ? message : "请检查文章信息后再保存。",
      });
      return;
    }

    toast.success("更新文章成功");
    setEditPostId(null);
  }

  async function handleExtractOffers(postId: number) {
    setExtractingPostId(postId);

    try {
      const result = await importServerOffersFromPostAction(postId);
      if (!result.success) {
        toast.error(result.message ?? result.error);
        return;
      }

      const data = result.data;
      if (!data) {
        toast.error("提取完成但没有返回统计信息");
        return;
      }

      toast.success("套餐数据提取完成", {
        description: describeImportStats(data),
      });
      router.refresh();
    } finally {
      setExtractingPostId(null);
    }
  }

  function toggleSelection(id: number, checked: boolean) {
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id),
    );
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? sortedPosts.map((post) => post.id) : []);
  }

  return (
    <div className="space-y-4">
      <AdminTableWorkbench
        title="文章工作台"
        description="支持快速搜索标题与 slug，按发布状态筛选，并可批量删除文章。"
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
              <SelectTrigger className="h-9 w-full border-border/70 bg-background shadow-none focus:ring-0 sm:w-[132px] sm:border-0 sm:bg-transparent sm:p-0">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="published">已发布</SelectItem>
                <SelectItem value="draft">草稿</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortValue} onValueChange={setSortValue}>
              <SelectTrigger className="h-9 w-full border-border/70 bg-background shadow-none focus:ring-0 sm:w-[152px] sm:border-0 sm:bg-transparent sm:p-0">
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
          <Button
            variant="destructive"
            disabled={selectedIds.length === 0 || isBulkDeleting}
            onClick={handleBulkDelete}
            className="min-h-10 w-full sm:w-auto"
          >
            <Trash2 className="size-4" />
            {isBulkDeleting ? "删除中..." : "批量删除"}
          </Button>
        }
      />

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
                        className="h-10"
                        autoFocus
                        value={editPostData?.title ?? ""}
                        onChange={(e) =>
                          handleInputChange("title", e.target.value)
                        }
                      />
                      <Input
                        className="h-10"
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
                          className="h-10"
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
                      className="min-h-10"
                      onClick={() => setEditPostId(null)}
                    >
                      取消
                    </Button>
                    <Button className="min-h-10" onClick={() => handleSave(post.id)}>
                      {isSaving ? "保存中..." : "保存"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="min-h-10"
                      disabled={extractingPostId === post.id}
                      onClick={() => handleExtractOffers(post.id)}
                    >
                      <FileSearch className="size-4" />
                      {extractingPostId === post.id ? "提取中..." : "提取套餐"}
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-10"
                      onClick={() => {
                        setEditPostId(post.id);
                        setEditPostData(post);
                      }}
                    >
                      编辑
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="col-span-2 min-h-10">
                          删除
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>确定删除这篇文章吗？</AlertDialogTitle>
                          <AlertDialogDescription>
                            删除后将无法恢复，当前文章为
                            <p className="mt-2 text-red-500">{post.title}</p>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(post.id)}>
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
              <TableHead className="text-nowrap">标题</TableHead>
              <TableHead className="text-nowrap">slug</TableHead>
              <TableHead className="text-nowrap text-center">发布</TableHead>
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
                <TableCell className="min-w-[220px] max-w-[360px]">
                  {editPostId === post.id ? (
                    <Input
                      className="h-8"
                      autoFocus
                      value={editPostData?.title ?? ""}
                      onChange={(e) => handleInputChange("title", e.target.value)}
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
                      className="h-8"
                      value={editPostData?.slug ?? ""}
                      onChange={(e) => handleInputChange("slug", e.target.value)}
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
                    <CircleCheck className="mx-auto text-primary" size={20} />
                  ) : (
                    <CircleX className="mx-auto text-muted-foreground" size={20} />
                  )}
                </TableCell>
                <TableCell className="max-w-[200px] text-nowrap">
                  {editPostId === post.id ? (
                    <div className="flex min-w-[300px] items-center gap-2">
                      <Input
                        className="h-8"
                        value={editPostData?.imgUrl ?? ""}
                        onChange={(e) => handleInputChange("imgUrl", e.target.value)}
                      />
                      <ImageLibraryPicker
                        triggerLabel="选择"
                        onSelect={(value) => handleInputChange("imgUrl", value)}
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
                          className="h-8 min-h-0 px-2"
                          onClick={() => setEditPostId(null)}
                        >
                          取消
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 min-h-0 px-2"
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
                          className="h-8 min-h-0 px-2"
                          disabled={extractingPostId === post.id}
                          onClick={() => handleExtractOffers(post.id)}
                        >
                          <FileSearch className="size-4" />
                          {extractingPostId === post.id ? "提取中..." : "提取套餐"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 min-h-0 px-2"
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
                              className="h-8 min-h-0 px-2"
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
                                <p className="mt-2 text-red-500">{post.title}</p>
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
