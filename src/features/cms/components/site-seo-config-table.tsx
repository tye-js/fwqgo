"use client";

import { useState, useTransition } from "react";
import { Edit3 } from "lucide-react";
import { toast } from "sonner";

import { updateSiteSeoConfig } from "@/features/cms/actions/site-seo-config";
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

type SiteSeoConfigRow = {
  language: "zh" | "en";
  siteName: string;
  title: string;
  description: string;
  keywords: string;
};

const languageLabel: Record<SiteSeoConfigRow["language"], string> = {
  zh: "中文",
  en: "英文",
};

export function SiteSeoConfigTable({ data }: { data: SiteSeoConfigRow[] }) {
  const [rows, setRows] = useState(data);
  const [editingRow, setEditingRow] = useState<SiteSeoConfigRow | null>(null);
  const [siteName, setSiteName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [isPending, startTransition] = useTransition();

  function openEditor(row: SiteSeoConfigRow) {
    setEditingRow(row);
    setSiteName(row.siteName);
    setTitle(row.title);
    setDescription(row.description);
    setKeywords(row.keywords);
  }

  function handleSave() {
    if (!editingRow) return;

    startTransition(async () => {
      const result = await updateSiteSeoConfig({
        language: editingRow.language,
        siteName,
        title,
        description,
        keywords,
      });

      if (result.error || !result.data) {
        toast.error(result.message ?? result.error ?? "站点 SEO 保存失败");
        return;
      }
      const savedConfig = result.data;

      setRows((currentRows) =>
        currentRows.map((row) =>
          row.language === editingRow.language
            ? {
                language: editingRow.language,
                siteName: savedConfig.siteName,
                title: savedConfig.title,
                description: savedConfig.description ?? "",
                keywords: savedConfig.keywords ?? "",
              }
            : row,
        ),
      );
      toast.success("站点 SEO 配置已更新");
      setEditingRow(null);
    });
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">语言</TableHead>
            <TableHead className="min-w-36">站点名</TableHead>
            <TableHead className="min-w-48">标题</TableHead>
            <TableHead className="min-w-72">Description</TableHead>
            <TableHead className="min-w-56">Keywords</TableHead>
            <TableHead className="w-24 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.language}>
              <TableCell>{languageLabel[row.language]}</TableCell>
              <TableCell className="font-medium">{row.siteName}</TableCell>
              <TableCell>{row.title}</TableCell>
              <TableCell className="max-w-[420px] whitespace-normal text-sm leading-6 text-muted-foreground">
                {row.description}
              </TableCell>
              <TableCell className="max-w-[320px] whitespace-normal text-sm leading-6 text-muted-foreground">
                {row.keywords}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" onClick={() => openEditor(row)}>
                  <Edit3 className="size-4" />
                  编辑
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={Boolean(editingRow)} onOpenChange={(open) => !open && setEditingRow(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑站点 SEO</DialogTitle>
            <DialogDescription>
              {editingRow ? `${languageLabel[editingRow.language]}首页 SEO 配置` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="site-seo-name">
                  站点名
                </label>
                <Input
                  id="site-seo-name"
                  value={siteName}
                  onChange={(event) => setSiteName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="site-seo-title">
                  首页标题
                </label>
                <Input
                  id="site-seo-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="site-seo-description">
                Description
              </label>
              <Textarea
                id="site-seo-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="site-seo-keywords">
                Keywords
              </label>
              <Input
                id="site-seo-keywords"
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                placeholder="关键词之间用英文逗号分隔"
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
    </>
  );
}
