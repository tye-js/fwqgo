"use client";

import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ArticleShareActions({
  title,
  url,
}: {
  title: string;
  url: string;
}) {
  const xUrl = `https://twitter.com/intent/tweet?${new URLSearchParams({
    text: title,
    url,
  }).toString()}`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("文章链接已复制");
    } catch {
      toast.error("复制失败，请手动复制浏览器地址");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11"
        onClick={copyUrl}
      >
        <Copy className="size-4" />
        复制链接
      </Button>
      <Button asChild variant="outline" size="sm" className="min-h-11">
        <a href={xUrl} target="_blank" rel="noopener noreferrer">
          <Share2 className="size-4" />
          分享到 X
        </a>
      </Button>
    </div>
  );
}
