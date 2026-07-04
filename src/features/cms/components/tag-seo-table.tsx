"use client";

import { useState, useTransition } from "react";
import { Edit3 } from "lucide-react";
import { toast } from "sonner";
import { updateTagIndexable, updateTagSeo } from "@/features/cms/actions/tag";
import { AdminTableEmpty } from "@/features/cms/components/admin-table-workbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function TagSeoTable({ tags }: { tags: TagSeoRow[] }) {
  const [rows, setRows] = useState(tags);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingRow, setEditingRow] = useState<TagSeoRow | null>(null);
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [enName, setEnName] = useState("");
  const [enSlug, setEnSlug] = useState("");
  const [enDescription, setEnDescription] = useState("");
  const [enKeywords, setEnKeywords] = useState("");

  function openEditor(tag: TagSeoRow) {
    setEditingRow(tag);
    setDescription(tag.description ?? "");
    setKeywords(tag.keywords ?? "");
    setEnName(tag.enName ?? "");
    setEnSlug(tag.enSlug ?? "");
    setEnDescription(tag.enDescription ?? "");
    setEnKeywords(tag.enKeywords ?? "");
  }

  const handleIndexableChange = (tag: TagSeoRow, indexable: boolean) => {
    const previousRows = rows;

    setPendingId(tag.id);
    setRows((current) =>
      current.map((row) => (row.id === tag.id ? { ...row, indexable } : row)),
    );

    startTransition(async () => {
      const result = await updateTagIndexable({ id: tag.id, indexable });

      setPendingId(null);

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
    });
  };

  function handleSaveSeo() {
    if (!editingRow) return;

    startTransition(async () => {
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
        toast.error(result.error ?? "标签 SEO 保存失败");
        return;
      }

      setRows((currentRows) =>
        currentRows.map((row) =>
          row.id === editingRow.id ? { ...row, ...result.data } : row,
        ),
      );
      toast.success("标签 SEO 已更新");
      setEditingRow(null);
    });
  }

  if (rows.length === 0) {
    return (
      <AdminTableEmpty
        title="暂无标签"
        description="还没有可维护的标签 SEO 数据。发布文章并关联标签后，这里会显示标签聚合页的中英文 SEO 配置。"
      />
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border/70">
        <Table className="min-w-[1100px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>标签</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>英文标签</TableHead>
              <TableHead>Keywords</TableHead>
              <TableHead className="w-28 text-center">SEO 收录</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((tag) => (
              <TableRow key={tag.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {tag.id}
                </TableCell>
                <TableCell className="font-medium">{tag.name}</TableCell>
                <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">
                  {tag.slug}
                </TableCell>
                <TableCell className="max-w-[320px] truncate text-sm text-muted-foreground">
                  {tag.description ?? "-"}
                </TableCell>
                <TableCell className="max-w-[260px] text-sm">
                  {tag.enName || tag.enSlug ? (
                    <div>
                      <p className="font-medium">
                        {tag.enName ?? "未填写英文名"}
                      </p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {tag.enSlug ?? "未填写英文 slug"}
                      </p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[260px] truncate text-sm text-muted-foreground">
                  {tag.keywords ?? "-"}
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
                    <Badge variant={tag.indexable ? "default" : "secondary"}>
                      {tag.indexable ? "收录" : "不收录"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditor(tag)}
                  >
                    <Edit3 className="size-4" />
                    编辑
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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

          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
