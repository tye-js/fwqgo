"use client";

import { useMemo, useState, useTransition } from "react";
import { Edit3 } from "lucide-react";
import { toast } from "sonner";

import { updateCategorySeo } from "@/features/cms/actions/category";
import { AdminTableEmpty, AdminTableWorkbench } from "@/features/cms/components/admin-table-workbench";
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

export function CategorySeoTable({ data }: { data: CategorySeoRow[] }) {
  const [rows, setRows] = useState(data);
  const [query, setQuery] = useState("");
  const [editingRow, setEditingRow] = useState<CategorySeoRow | null>(null);
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [enName, setEnName] = useState("");
  const [enSlug, setEnSlug] = useState("");
  const [enDescription, setEnDescription] = useState("");
  const [enKeywords, setEnKeywords] = useState("");
  const [isPending, startTransition] = useTransition();

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

  function openEditor(row: CategorySeoRow) {
    setEditingRow(row);
    setDescription(row.description ?? "");
    setKeywords(row.keywords ?? "");
    setEnName(row.enName ?? "");
    setEnSlug(row.enSlug ?? "");
    setEnDescription(row.enDescription ?? "");
    setEnKeywords(row.enKeywords ?? "");
  }

  function handleSave() {
    if (!editingRow) {
      return;
    }

    startTransition(async () => {
      const result = await updateCategorySeo({
        id: editingRow.id,
        description,
        keywords,
        enName,
        enSlug,
        enDescription,
        enKeywords,
      });

      if ("error" in result && typeof result.error === "string") {
        toast.error(result.message ?? result.error);
        return;
      }

      setRows((currentRows) =>
        currentRows.map((row) =>
          row.id === editingRow.id
            ? {
                ...row,
                description: result.data.description,
                keywords: result.data.keywords,
                enName: result.data.enName,
                enSlug: result.data.enSlug,
                enDescription: result.data.enDescription,
                enKeywords: result.data.enKeywords,
              }
            : row,
        ),
      );
      toast.success("分类 SEO 已更新");
      setEditingRow(null);
    });
  }

  return (
    <div className="space-y-5">
      <AdminTableWorkbench
        title="分类 SEO 工作台"
        description="按分类名称、slug、description 或 keywords 搜索，并直接维护中英文分类页的 SEO 元信息。"
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="搜索分类、slug 或 SEO 内容"
      />

      {filteredRows.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                <TableHead className="min-w-36">分类</TableHead>
                <TableHead className="min-w-40">Slug</TableHead>
                <TableHead className="min-w-72">Description</TableHead>
                <TableHead className="min-w-56">英文分类</TableHead>
                <TableHead className="min-w-56">Keywords</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((category) => (
                <CategorySeoTableRow
                  key={category.id}
                  category={category}
                  onEdit={openEditor}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <AdminTableEmpty
          title="没有匹配的分类"
          description="换一个关键词后再搜索，或清空搜索条件查看全部叶子分类。"
        />
      )}

      <Dialog open={Boolean(editingRow)} onOpenChange={(open) => !open && setEditingRow(null)}>
        <DialogContent className="max-w-2xl">
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
              <label className="text-sm font-medium" htmlFor="category-seo-description">
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
              <label className="text-sm font-medium" htmlFor="category-seo-keywords">
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
              <label className="text-sm font-medium" htmlFor="category-seo-en-name">
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
              <label className="text-sm font-medium" htmlFor="category-seo-en-slug">
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
              <label className="text-sm font-medium" htmlFor="category-seo-en-description">
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
              <label className="text-sm font-medium" htmlFor="category-seo-en-keywords">
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

          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategorySeoTableRow({
  category,
  onEdit,
}: {
  category: CategorySeoRow;
  onEdit: (category: CategorySeoRow) => void;
}) {
  const description = category.description?.trim() ?? "";
  const keywords = category.keywords?.trim() ?? "";
  const enName = category.enName?.trim() ?? "";
  const enSlug = category.enSlug?.trim() ?? "";

  return (
    <TableRow>
      <TableCell className="text-muted-foreground">{category.id}</TableCell>
      <TableCell className="font-medium">{category.name}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {category.slug}
      </TableCell>
      <TableCell className="max-w-[420px] whitespace-normal text-sm leading-6">
        {description.length > 0 ? (
          description
        ) : (
          <span className="text-muted-foreground">未填写</span>
        )}
      </TableCell>
      <TableCell className="max-w-[260px] whitespace-normal text-sm leading-6">
        {enName || enSlug ? (
          <div>
            <p className="font-medium">{enName || "未填写英文名"}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {enSlug || "未填写英文 slug"}
            </p>
          </div>
        ) : (
          <span className="text-muted-foreground">未填写</span>
        )}
      </TableCell>
      <TableCell className="max-w-[320px] whitespace-normal text-sm leading-6">
        {keywords.length > 0 ? (
          keywords
        ) : (
          <span className="text-muted-foreground">未填写</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" onClick={() => onEdit(category)}>
          <Edit3 className="size-4" />
          编辑
        </Button>
      </TableCell>
    </TableRow>
  );
}
