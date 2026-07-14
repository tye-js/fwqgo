"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import {
  AdminTableEmpty,
  AdminTableWorkbench,
} from "@/features/cms/components/admin-table-workbench";
import { Button } from "@/components/ui/button";
import { useUrlQueryUpdater } from "@/features/cms/hooks/use-url-query-updater";
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

export function ShortLinkTable({
  links,
  initialQuery = "",
  publicOrigin: initialPublicOrigin = "",
}: {
  links: ShortLinkRow[];
  initialQuery?: string;
  publicOrigin?: string;
}) {
  const updateUrlQuery = useUrlQueryUpdater();
  const [query, setQuery] = useState(initialQuery);
  const publicOrigin = initialPublicOrigin.replace(/\/+$/, "");

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery === initialQuery.trim()) return;

    const timeoutId = window.setTimeout(() => {
      updateUrlQuery({ query: normalizedQuery || null });
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [initialQuery, query, updateUrlQuery]);

  async function copyShortLink(slug: string) {
    const resolvedOrigin =
      publicOrigin ||
      window.location.origin.replace(/^https:\/\/cms\./, "https://");
    const url = `${resolvedOrigin}/go/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("短链已复制", {
        description: url,
      });
    } catch {
      toast.error("短链复制失败，请手动复制", {
        description: url,
      });
    }
  }

  return (
    <div className="space-y-4">
      <AdminTableWorkbench
        title="短链跳转"
        description="文章发布时外部链接会被转换为 /go/{slug}，这里用于检查短链和目标 URL。"
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="搜索 slug 或目标 URL"
      />

      {links.length === 0 ? (
        <AdminTableEmpty
          title="没有匹配的短链"
          description="发布包含外部链接的文章后，系统会自动生成短链。"
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">短链</TableHead>
                <TableHead className="min-w-[320px]">目标 URL</TableHead>
                <TableHead className="w-[170px]">创建时间</TableHead>
                <TableHead className="w-[120px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => (
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
                          href={
                            publicOrigin
                              ? `${publicOrigin}/go/${link.slug}`
                              : `/go/${link.slug}`
                          }
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
