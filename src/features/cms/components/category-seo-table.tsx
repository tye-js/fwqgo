"use client";

import { useMemo, useState, useTransition } from "react";
import { Edit3, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  batchGenerateCategorySeoWithAi,
  generateCategorySeoWithAi,
  updateCategorySeo,
} from "@/features/cms/actions/category";
import {
  AdminTableEmpty,
  AdminTableWorkbench,
} from "@/features/cms/components/admin-table-workbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export type CategorySeoRow = {
  id: number;
  name: string;
  slug: string;
  enName: string | null;
  enSlug: string | null;
  description: string | null;
  keywords: string | null;
  enDescription: string | null;
  enKeywords: string | null;
};

function getActionDescription(result: { message?: string; error?: string }) {
  return result.message ?? result.error;
}

function getClientErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "未知错误";
}

function hasSeoContent(category: CategorySeoRow) {
  return [
    category.description,
    category.keywords,
    category.enName,
    category.enSlug,
    category.enDescription,
    category.enKeywords,
  ].some((value) => Boolean(value?.trim()));
}

export function CategorySeoTable({ data }: { data: CategorySeoRow[] }) {
  const [rows, setRows] = useState(data);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingRow, setEditingRow] = useState<CategorySeoRow | null>(null);
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [enName, setEnName] = useState("");
  const [enSlug, setEnSlug] = useState("");
  const [enDescription, setEnDescription] = useState("");
  const [enKeywords, setEnKeywords] = useState("");
  const [aiPendingId, setAiPendingId] = useState<number | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isAiPending, startAiTransition] = useTransition();

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return rows;
    }

    return rows.filter((row) => {
      return (
        row.name.toLowerCase().includes(normalizedQuery) ||
        row.slug.toLowerCase().includes(normalizedQuery) ||
        String(row.id).includes(normalizedQuery) ||
        (row.description ?? "").toLowerCase().includes(normalizedQuery) ||
        (row.keywords ?? "").toLowerCase().includes(normalizedQuery) ||
        (row.enName ?? "").toLowerCase().includes(normalizedQuery) ||
        (row.enSlug ?? "").toLowerCase().includes(normalizedQuery) ||
        (row.enDescription ?? "").toLowerCase().includes(normalizedQuery) ||
        (row.enKeywords ?? "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [query, rows]);

  const visibleSelectedCount = filteredRows.filter((row) =>
    selectedIds.has(row.id),
  ).length;
  const allVisibleSelected =
    filteredRows.length > 0 && visibleSelectedCount === filteredRows.length;
  const selectedRowIds = Array.from(selectedIds).filter((id) =>
    rows.some((row) => row.id === id),
  );

  function fillEditor(row: CategorySeoRow) {
    setDescription(row.description ?? "");
    setKeywords(row.keywords ?? "");
    setEnName(row.enName ?? "");
    setEnSlug(row.enSlug ?? "");
    setEnDescription(row.enDescription ?? "");
    setEnKeywords(row.enKeywords ?? "");
  }

  function openEditor(row: CategorySeoRow) {
    setEditingRow(row);
    fillEditor(row);
  }

  function mergeUpdatedCategory(category: CategorySeoRow) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === category.id ? { ...row, ...category } : row,
      ),
    );
    setEditingRow((current) =>
      current?.id === category.id ? { ...current, ...category } : current,
    );
  }

  function toggleSelected(id: number, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  }

  function toggleVisibleSelected(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);

      for (const row of filteredRows) {
        if (checked) {
          next.add(row.id);
        } else {
          next.delete(row.id);
        }
      }

      return next;
    });
  }

  function handleSave() {
    if (!editingRow) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateCategorySeo({
          id: editingRow.id,
          description,
          keywords,
          enName,
          enSlug,
          enDescription,
          enKeywords,
        });

        if (result.error || !result.data) {
          toast.error(result.error ?? "分类 SEO 保存失败", {
            description: getActionDescription(result),
          });
          return;
        }

        mergeUpdatedCategory(result.data);
        toast.success("分类 SEO 已更新");
        setEditingRow(null);
      } catch (error) {
        toast.error("分类 SEO 保存失败", {
          description: getClientErrorMessage(error),
        });
      }
    });
  }

  function handleGenerateSeo(category: CategorySeoRow) {
    setAiPendingId(category.id);

    startAiTransition(async () => {
      try {
        const result = await generateCategorySeoWithAi({ id: category.id });

        if (result.error || !result.data) {
          toast.error(result.error ?? "AI 生成分类 SEO 失败", {
            description: getActionDescription(result),
          });
          return;
        }

        mergeUpdatedCategory(result.data);
        if (editingRow?.id === result.data.id) {
          fillEditor(result.data);
        }
        toast.success("分类 SEO 已由 AI 生成", {
          description: `${result.data.name} / ${result.data.enSlug ?? result.data.slug}`,
        });
      } catch (error) {
        toast.error("AI 生成分类 SEO 失败", {
          description: getClientErrorMessage(error),
        });
      } finally {
        setAiPendingId(null);
      }
    });
  }

  function handleBatchGenerateSeo() {
    if (selectedRowIds.length === 0) {
      toast.error("请先选择要批量生成的分类");
      return;
    }

    setIsBatchGenerating(true);

    startAiTransition(async () => {
      try {
        const result = await batchGenerateCategorySeoWithAi({
          ids: selectedRowIds,
        });
        const batchData = result.data;

        if (batchData?.updated.length) {
          setRows((currentRows) =>
            currentRows.map((row) => {
              const updatedRow = batchData.updated.find(
                (updated) => updated.id === row.id,
              );

              return updatedRow ? { ...row, ...updatedRow } : row;
            }),
          );
          setSelectedIds(new Set());
        }

        if (result.error) {
          toast.error(result.error, {
            description: getActionDescription(result),
          });
          return;
        }

        if (!batchData) {
          toast.error("批量 AI 生成失败", {
            description: "没有收到生成结果，请稍后重试",
          });
          return;
        }

        toast.success(result.message ?? "批量 AI 生成完成", {
          description: batchData.errors.length
            ? batchData.errors
                .slice(0, 3)
                .map((item) => `${item.name ?? item.id}: ${item.reason}`)
                .join("；")
            : undefined,
        });
      } catch (error) {
        toast.error("批量 AI 生成失败", {
          description: getClientErrorMessage(error),
        });
      } finally {
        setIsBatchGenerating(false);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <AdminTableEmpty
        title="暂无叶子分类"
        description="当前没有可维护的叶子分类 SEO 数据。"
      />
    );
  }

  return (
    <div className="space-y-5">
      <AdminTableWorkbench
        title="分类 SEO 工作台"
        description="维护分类页的 Description、Keywords、英文分类、英文 slug、英文 Description 和英文 Keywords；AI 生成会按 SEO 摘要长度、搜索意图和关键词数量校验结果。"
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="搜索分类、slug、Description、Keywords 或英文内容"
        selectionCount={selectedRowIds.length}
        actionSlot={
          <Button
            type="button"
            onClick={handleBatchGenerateSeo}
            disabled={
              selectedRowIds.length === 0 || isAiPending || isBatchGenerating
            }
          >
            {isBatchGenerating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {isBatchGenerating ? "批量生成中..." : "AI 批量生成"}
          </Button>
        }
      />

      {filteredRows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border/70">
          <Table className="min-w-[1320px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      allVisibleSelected
                        ? true
                        : visibleSelectedCount > 0
                          ? "indeterminate"
                          : false
                    }
                    aria-label="选择当前分类"
                    onCheckedChange={(checked) =>
                      toggleVisibleSelected(checked === true)
                    }
                  />
                </TableHead>
                <TableHead className="w-16">ID</TableHead>
                <TableHead className="min-w-36">分类</TableHead>
                <TableHead className="min-w-40">Slug</TableHead>
                <TableHead className="min-w-80">中文 SEO</TableHead>
                <TableHead className="min-w-96">英文 SEO</TableHead>
                <TableHead className="w-48 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((category) => {
                const rowAiPending =
                  aiPendingId === category.id ||
                  (isBatchGenerating && selectedIds.has(category.id));
                const categoryHasSeoContent = hasSeoContent(category);
                const hasEnglishIdentity = Boolean(
                  category.enName ?? category.enSlug,
                );

                return (
                  <TableRow key={category.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(category.id)}
                        aria-label={`选择 ${category.name}`}
                        onCheckedChange={(checked) =>
                          toggleSelected(category.id, checked === true)
                        }
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {category.id}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        <span>{category.name}</span>
                        <Badge
                          variant={
                            categoryHasSeoContent ? "outline" : "secondary"
                          }
                          className="block w-fit rounded-sm"
                        >
                          {categoryHasSeoContent ? "已配置" : "待生成"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {category.slug}
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm leading-6">
                      {category.description ? (
                        <p>{category.description}</p>
                      ) : (
                        <p className="text-muted-foreground">未填写</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Keywords：{category.keywords ?? "未填写"}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm leading-6">
                      {hasEnglishIdentity ? (
                        <div>
                          <p className="font-medium">
                            {category.enName ?? "未填写英文分类"}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {category.enSlug ?? "未填写英文 slug"}
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">未填写英文分类</p>
                      )}
                      <p className="mt-1">
                        {category.enDescription ?? (
                          <span className="text-muted-foreground">
                            未填写英文 Description
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Keywords：{category.enKeywords ?? "未填写"}
                      </p>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleGenerateSeo(category)}
                          disabled={isAiPending || isBatchGenerating}
                        >
                          {rowAiPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Sparkles className="size-4" />
                          )}
                          AI 生成
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditor(category)}
                        >
                          <Edit3 className="size-4" />
                          编辑
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <AdminTableEmpty
          title="没有匹配的分类"
          description="换一个关键词后再搜索，或清空搜索条件查看全部叶子分类。"
        />
      )}

      <Dialog
        open={Boolean(editingRow)}
        onOpenChange={(open) => !open && setEditingRow(null)}
      >
        <DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑分类 SEO</DialogTitle>
            <DialogDescription>
              {editingRow
                ? `${editingRow.name} / ${editingRow.slug}`
                : "维护分类页的 description 和 keywords。"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="category-seo-description"
              >
                中文 Description
              </label>
              <Textarea
                id="category-seo-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="输入分类页 description"
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="category-seo-keywords"
              >
                中文 Keywords
              </label>
              <Input
                id="category-seo-keywords"
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                placeholder="关键词之间用英文逗号分隔"
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="category-seo-en-name"
              >
                英文分类名
              </label>
              <Input
                id="category-seo-en-name"
                value={enName}
                onChange={(event) => setEnName(event.target.value)}
                placeholder="English category name"
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="category-seo-en-slug"
              >
                英文 Slug
              </label>
              <Input
                id="category-seo-en-slug"
                value={enSlug}
                onChange={(event) => setEnSlug(event.target.value)}
                placeholder="english-category-slug"
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="category-seo-en-description"
              >
                英文 Description
              </label>
              <Textarea
                id="category-seo-en-description"
                value={enDescription}
                onChange={(event) => setEnDescription(event.target.value)}
                placeholder="English category description"
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="category-seo-en-keywords"
              >
                英文 Keywords
              </label>
              <Input
                id="category-seo-en-keywords"
                value={enKeywords}
                onChange={(event) => setEnKeywords(event.target.value)}
                placeholder="keywords separated by commas"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => editingRow && handleGenerateSeo(editingRow)}
              disabled={!editingRow || isAiPending || isBatchGenerating}
            >
              {aiPendingId === editingRow?.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              AI 生成
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setEditingRow(null)}
                disabled={isPending}
              >
                取消
              </Button>
              <Button onClick={handleSave} disabled={isPending}>
                {isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
