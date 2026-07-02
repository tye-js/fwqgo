"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, ImagePlus, XCircle } from "lucide-react";

import { batchGenerateArticleCoverImagesAction } from "@/features/cms/actions/article-cover-image";
import { AdminTableEmpty, AdminTableWorkbench } from "@/features/cms/components/admin-table-workbench";
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
  postId: number;
  title?: string;
  success: boolean;
  url?: string;
  assetId?: number;
  error?: string;
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

export function ArticleCoverBatchGenerator({
  posts,
}: {
  posts: CoverGenerationPost[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [coverFilter, setCoverFilter] = useState<"all" | "missing" | "has-cover">(
    "missing",
  );
  const [selectedIds, setSelectedIds] = useState<number[]>(
    posts.filter((post) => !post.imgUrl).slice(0, 20).map((post) => post.id),
  );
  const [results, setResults] = useState<GenerateResult[]>([]);
  const [isPending, startTransition] = useTransition();

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
  const selectedWithoutCoverCount = selectedPosts.filter((post) => !post.imgUrl).length;

  function toggleSelected(id: number, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])].slice(0, 20) : current.filter((item) => item !== id),
    );
  }

  function toggleAllFiltered(checked: boolean) {
    if (!checked) {
      setSelectedIds((current) =>
        current.filter((id) => !filteredPosts.some((post) => post.id === id)),
      );
      return;
    }

    setSelectedIds((current) => [
      ...new Set([...current, ...selectableFilteredPosts.map((post) => post.id)]),
    ].slice(0, 20));
  }

  function selectMissingCovers() {
    setCoverFilter("missing");
    setSelectedIds(posts.filter((post) => !post.imgUrl).slice(0, 20).map((post) => post.id));
  }

  function handleGenerate() {
    if (selectedIds.length === 0) {
      notifyError({
        title: "请选择文章",
        description: "至少选择 1 篇文章后再生成封面。",
      });
      return;
    }

    startTransition(async () => {
      const result = await batchGenerateArticleCoverImagesAction({
        postIds: selectedIds,
      });

      if (!result.success) {
        notifyError({
          title: "批量生成封面失败",
          description: result.error ?? "请检查生图接口配置",
        });
        return;
      }

      const resultRows = result.results ?? [];
      const failedCount = result.failedCount ?? resultRows.filter((item) => !item.success).length;
      const successCount = result.successCount ?? resultRows.filter((item) => item.success).length;

      setResults(resultRows);
      notifySuccess({
        title: "文章封面生成完成",
        description: describeAdminResult([
          `成功 ${successCount} 篇`,
          failedCount > 0 ? `失败 ${failedCount} 篇` : null,
          "成功项已写入文章封面并同步图片引用",
        ]),
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <AdminTableWorkbench
        title="文章封面生成"
        description="批量选择文章后调用生图接口生成中文文章封面，成功后直接写入文章封面。单次最多 20 篇。"
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="搜索标题、slug 或分类"
        selectionCount={selectedIds.length}
        filterSlot={
          <Select value={coverFilter} onValueChange={(value) => setCoverFilter(value as typeof coverFilter)}>
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
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={selectMissingCovers}>
              选择无封面
            </Button>
            <Button
              type="button"
              disabled={isPending || selectedIds.length === 0}
              onClick={handleGenerate}
            >
              <ImagePlus className="size-4" />
              {isPending ? "生成中..." : `生成封面 ${selectedIds.length}`}
            </Button>
          </div>
        }
      />

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
                key={result.postId}
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
                  ) : (
                    <p className="text-xs text-destructive">
                      {result.error ?? "生成失败"}
                    </p>
                  )}
                </div>
                <Badge variant={result.success ? "default" : "destructive"}>
                  {result.success ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : (
                    <XCircle className="size-3.5" />
                  )}
                  {result.success ? "成功" : "失败"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-border/70 bg-background shadow-sm">
        {filteredPosts.length === 0 ? (
          <AdminTableEmpty
            title="没有匹配的文章"
            description="调整搜索词或筛选条件后再选择文章生成封面。"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={(checked) => toggleAllFiltered(Boolean(checked))}
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
                      onCheckedChange={(checked) => toggleSelected(post.id, Boolean(checked))}
                      aria-label={`选择 ${post.title}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="line-clamp-2 font-medium">{post.title}</p>
                        <Badge variant="outline">{post.categoryName ?? "未分类"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{post.slug}</p>
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
                      <Link href={`/end/posts/edit/post/${post.slug}`}>
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
