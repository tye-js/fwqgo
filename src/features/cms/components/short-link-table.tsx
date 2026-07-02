"use client";

import { useMemo, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { AdminTableEmpty, AdminTableWorkbench } from "@/features/cms/components/admin-table-workbench";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ShortLinkRow = {
  id: number;
  slug: string;
  targetUrl: string;
  createdAt: string;
  updatedAt: string | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ShortLinkTable({ links }: { links: ShortLinkRow[] }) {
  const [query, setQuery] = useState("");

  const filteredLinks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return links;

    return links.filter((link) => {
      return (
        link.slug.toLowerCase().includes(normalizedQuery) ||
        link.targetUrl.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [links, query]);

  async function copyShortLink(slug: string) {
    const publicOrigin =
      process.env.NEXT_PUBLIC_URL?.replace(/\/+$/, "") ??
      window.location.origin.replace(/^https:\/\/cms\./, "https://");
    const url = `${publicOrigin}/go/${slug}`;
    await navigator.clipboard.writeText(url);
    toast.success("短链已复制", {
      description: url,
    });
  }

  return (
    <div className="space-y-4">
      <AdminTableWorkbench
        title="短链跳转"
        description="文章发布时外部链接会被转换为 /go/{slug}，这里用于检查短链和目标 URL。"
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="搜索 slug 或目标 URL"
        selectionCount={filteredLinks.length}
      />

      {filteredLinks.length === 0 ? (
        <AdminTableEmpty
          title="没有匹配的短链"
          description="发布包含外部链接的文章后，系统会自动生成短链。"
        />
      ) : (
        <div className="rounded-lg border border-border/70 bg-background shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">短链</TableHead>
                <TableHead>目标 URL</TableHead>
                <TableHead className="w-[170px]">创建时间</TableHead>
                <TableHead className="w-[120px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLinks.map((link) => (
                <TableRow key={link.id}>
                  <TableCell className="font-mono text-sm">
                    /go/{link.slug}
                  </TableCell>
                  <TableCell className="max-w-[520px]">
                    <a
                      href={link.targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-primary"
                    >
                      {link.targetUrl}
                    </a>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(link.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => copyShortLink(link.slug)}
                        aria-label={`复制 /go/${link.slug}`}
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button asChild size="icon" variant="outline">
                        <a
                          href={`/go/${link.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`打开 /go/${link.slug}`}
                        >
                          <ExternalLink className="size-4" />
                        </a>
                      </Button>
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
