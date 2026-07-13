"use client";

import { useEffect, useState, useTransition } from "react";
import { Edit3, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  batchGenerateTagSeoWithAi,
  generateTagSeoWithAi,
  updateTagIndexable,
  updateTagSeo,
} from "@/features/cms/actions/tag";
import {
  AdminTableEmpty,
  AdminTableWorkbench,
} from "@/features/cms/components/admin-table-workbench";
import { useUrlQueryUpdater } from "@/features/cms/hooks/use-url-query-updater";
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

type TagSeoRow = {
  id: number;
  name: string;
  slug: string;
  enName: string | null;
  enSlug: string | null;
  description: string | null;
  keywords: string | null;
  enDescription: string | null;
  enKeywords: string | null;
  indexable: boolean;
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

function hasSeoContent(tag: TagSeoRow) {
  return [
    tag.description,
    tag.keywords,
    tag.enName,
    tag.enSlug,
    tag.enDescription,
    tag.enKeywords,
  ].some((value) => Boolean(value?.trim()));
}

export function TagSeoTable({
  tags,
  initialQuery,
}: {
  tags: TagSeoRow[];
  initialQuery: string;
}) {
  const updateUrlQuery = useUrlQueryUpdater();
  const [rows, setRows] = useState(tags);
  const [query, setQuery] = useState(initialQuery);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [aiPendingId, setAiPendingId] = useState<number | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isAiPending, startAiTransition] = useTransition();
  const [editingRow, setEditingRow] = useState<TagSeoRow | null>(null);
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [enName, setEnName] = useState("");
  const [enSlug, setEnSlug] = useState("");
  const [enDescription, setEnDescription] = useState("");
  const [enKeywords, setEnKeywords] = useState("");

  useEffect(() => {
    const normalizedInitialQuery = initialQuery.trim();
    const normalizedQuery = query.trim();

    if (normalizedQuery === normalizedInitialQuery) return;

    const timeoutId = window.setTimeout(() => {
      updateUrlQuery({ query: normalizedQuery || null });
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [initialQuery, query, updateUrlQuery]);

  const visibleSelectedCount = rows.filter((row) =>
    selectedIds.has(row.id),
  ).length;
  const allVisibleSelected =
    rows.length > 0 && visibleSelectedCount === rows.length;
  const selectedRowIds = Array.from(selectedIds).filter((id) =>
    rows.some((row) => row.id === id),
  );

  function fillEditor(tag: TagSeoRow) {
    setDescription(tag.description ?? "");
    setKeywords(tag.keywords ?? "");
    setEnName(tag.enName ?? "");
    setEnSlug(tag.enSlug ?? "");
    setEnDescription(tag.enDescription ?? "");
    setEnKeywords(tag.enKeywords ?? "");
  }

  function openEditor(tag: TagSeoRow) {
    setEditingRow(tag);
    fillEditor(tag);
  }

  function mergeUpdatedTag(tag: TagSeoRow) {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === tag.id ? { ...row, ...tag } : row)),
    );
    setEditingRow((current) =>
      current?.id === tag.id ? { ...current, ...tag } : current,
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

      for (const row of rows) {
        if (checked) {
          next.add(row.id);
        } else {
          next.delete(row.id);
        }
      }

      return next;
    });
  }

  const handleIndexableChange = (tag: TagSeoRow, indexable: boolean) => {
    const previousRows = rows;

    setPendingId(tag.id);
    setRows((current) =>
      current.map((row) => (row.id === tag.id ? { ...row, indexable } : row)),
    );

    startTransition(async () => {
      try {
        const result = await updateTagIndexable({ id: tag.id, indexable });

        if (result.error) {
          setRows(previousRows);
          toast.error("标签收录状态更新失败", {
            description: result.error,
          });
          return;
        }

        toast.success(indexable ? "标签已允许收录" : "标签已从 sitemap 移除", {
          description: `${tag.name} (${tag.slug})`,
        });
      } catch (error) {
        setRows(previousRows);
        toast.error("标签收录状态更新失败", {
          description: getClientErrorMessage(error),
        });
      } finally {
        setPendingId(null);
      }
    });
  };

  function handleSaveSeo() {
    if (!editingRow) return;

    startTransition(async () => {
      try {
        const result = await updateTagSeo({
          id: editingRow.id,
          description,
          keywords,
          enName,
          enSlug,
          enDescription,
          enKeywords,
        });

        if (result.error || !result.data) {
          toast.error(result.error ?? "标签 SEO 保存失败", {
            description: getActionDescription(result),
          });
          return;
        }

        mergeUpdatedTag(result.data);
        toast.success("标签 SEO 已更新");
        setEditingRow(null);
      } catch (error) {
        toast.error("标签 SEO 保存失败", {
          description: getClientErrorMessage(error),
        });
      }
    });
  }

  function handleGenerateSeo(tag: TagSeoRow) {
    setAiPendingId(tag.id);

    startAiTransition(async () => {
      try {
        const result = await generateTagSeoWithAi({ id: tag.id });

        if (result.error || !result.data) {
          toast.error(result.error ?? "AI 生成标签 SEO 失败", {
            description: getActionDescription(result),
          });
          return;
        }

        mergeUpdatedTag(result.data);
        if (editingRow?.id === result.data.id) {
          fillEditor(result.data);
        }
        toast.success("标签 SEO 已由 AI 生成", {
          description: `${result.data.name} / ${result.data.enSlug ?? result.data.slug}`,
        });
      } catch (error) {
        toast.error("AI 生成标签 SEO 失败", {
          description: getClientErrorMessage(error),
        });
      } finally {
        setAiPendingId(null);
      }
    });
  }

  function handleBatchGenerateSeo() {
    if (selectedRowIds.length === 0) {
      toast.error("请先选择要批量生成的标签");
      return;
    }

    setIsBatchGenerating(true);

    startAiTransition(async () => {
      try {
        const result = await batchGenerateTagSeoWithAi({ ids: selectedRowIds });
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

  if (rows.length === 0 && !initialQuery) {
    return (
      <AdminTableEmpty
        title="暂无可维护的标签"
        description="价格、优惠、折扣类标签已从标签 SEO 管理中排除。发布文章并关联非价格类标签后，这里会显示中英文 SEO 配置。"
      />
    );
  }

  return (
    <div className="space-y-4">
      <AdminTableWorkbench
        title="标签 SEO 工作台"
        description="维护标签聚合页的 Description、Keywords、英文标签、英文 slug、英文 Description 和英文 Keywords；价格类标签已自动排除。"
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="搜索标签、slug、Description、Keywords 或英文内容"
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

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border/70">
          <Table className="min-w-[1380px]">
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
                    aria-label="选择当前页标签"
                    onCheckedChange={(checked) =>
                      toggleVisibleSelected(checked === true)
                    }
                  />
                </TableHead>
                <TableHead className="w-16">ID</TableHead>
                <TableHead className="min-w-36">标签</TableHead>
                <TableHead className="min-w-40">Slug</TableHead>
                <TableHead className="min-w-80">中文 SEO</TableHead>
                <TableHead className="min-w-96">英文 SEO</TableHead>
                <TableHead className="w-28 text-center">SEO 收录</TableHead>
                <TableHead className="w-48 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((tag) => {
                const rowAiPending =
                  aiPendingId === tag.id ||
                  (isBatchGenerating && selectedIds.has(tag.id));
                const tagHasSeoContent = hasSeoContent(tag);
                const hasEnglishIdentity = Boolean(tag.enName ?? tag.enSlug);

                return (
                  <TableRow key={tag.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(tag.id)}
                        aria-label={`选择 ${tag.name}`}
                        onCheckedChange={(checked) =>
                          toggleSelected(tag.id, checked === true)
                        }
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {tag.id}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        <span>{tag.name}</span>
                        <Badge
                          variant={tagHasSeoContent ? "outline" : "secondary"}
                          className="block w-fit rounded-sm"
                        >
                          {tagHasSeoContent ? "已配置" : "待生成"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {tag.slug}
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm leading-6">
                      {tag.description ? (
                        <p>{tag.description}</p>
                      ) : (
                        <p className="text-muted-foreground">未填写</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Keywords：{tag.keywords ?? "未填写"}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm leading-6">
                      {hasEnglishIdentity ? (
                        <div>
                          <p className="font-medium">
                            {tag.enName ?? "未填写英文标签"}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {tag.enSlug ?? "未填写英文 slug"}
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">未填写英文标签</p>
                      )}
                      <p className="mt-1">
                        {tag.enDescription ?? (
                          <span className="text-muted-foreground">
                            未填写英文 Description
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Keywords：{tag.enKeywords ?? "未填写"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <Switch
                          checked={tag.indexable}
                          disabled={isPending && pendingId === tag.id}
                          aria-label={`${tag.name} SEO 收录状态`}
                          onCheckedChange={(checked) =>
                            handleIndexableChange(tag, checked)
                          }
                        />
                        <Badge
                          variant={tag.indexable ? "default" : "secondary"}
                        >
                          {tag.indexable ? "收录" : "不收录"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleGenerateSeo(tag)}
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
                          onClick={() => openEditor(tag)}
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
          title="没有匹配的标签"
          description="换一个关键词后再搜索，或清空搜索条件查看全部非价格类标签。"
        />
      )}

      <Dialog
        open={Boolean(editingRow)}
        onOpenChange={(open) => !open && setEditingRow(null)}
      >
        <DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑标签 SEO</DialogTitle>
            <DialogDescription>
              {editingRow
                ? `${editingRow.name} / ${editingRow.slug}`
                : "维护标签聚合页的中英文 SEO 信息。"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="tag-seo-description"
              >
                中文 Description
              </label>
              <Textarea
                id="tag-seo-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="中文标签页描述"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="tag-seo-keywords">
                中文 Keywords
              </label>
              <Input
                id="tag-seo-keywords"
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                placeholder="关键词之间用英文逗号分隔"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="tag-seo-en-name">
                英文标签名
              </label>
              <Input
                id="tag-seo-en-name"
                value={enName}
                onChange={(event) => setEnName(event.target.value)}
                placeholder="English tag name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="tag-seo-en-slug">
                英文 Slug
              </label>
              <Input
                id="tag-seo-en-slug"
                value={enSlug}
                onChange={(event) => setEnSlug(event.target.value)}
                placeholder="english-tag-slug"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label
                className="text-sm font-medium"
                htmlFor="tag-seo-en-description"
              >
                英文 Description
              </label>
              <Textarea
                id="tag-seo-en-description"
                value={enDescription}
                onChange={(event) => setEnDescription(event.target.value)}
                placeholder="English tag page description"
                rows={4}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label
                className="text-sm font-medium"
                htmlFor="tag-seo-en-keywords"
              >
                英文 Keywords
              </label>
              <Input
                id="tag-seo-en-keywords"
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
              <Button onClick={handleSaveSeo} disabled={isPending}>
                {isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
