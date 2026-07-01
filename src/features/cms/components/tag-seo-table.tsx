"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateTagIndexable } from "@/features/cms/actions/tag";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TagSeoRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  keywords: string | null;
  indexable: boolean;
};

export function TagSeoTable({ tags }: { tags: TagSeoRow[] }) {
  const [rows, setRows] = useState(tags);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">ID</TableHead>
          <TableHead>标签</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Keywords</TableHead>
          <TableHead className="w-28 text-center">SEO 收录</TableHead>
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
