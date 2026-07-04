"use client";

import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ArticleShareActions({
  title,
  url,
  language = "zh",
}: {
  title: string;
  url: string;
  language?: "zh" | "en";
}) {
  const copy =
    language === "en"
      ? {
          copied: "Article link copied",
          copyFailed: "Copy failed. Please copy the address manually.",
          copy: "Copy link",
          shareX: "Share on X",
        }
      : {
          copied: "文章链接已复制",
          copyFailed: "复制失败，请手动复制浏览器地址",
          copy: "复制链接",
          shareX: "分享到 X",
        };
  const xUrl = `https://twitter.com/intent/tweet?${new URLSearchParams({
    text: title,
    url,
  }).toString()}`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(copy.copied);
    } catch {
      toast.error(copy.copyFailed);
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
        {copy.copy}
      </Button>
      <Button asChild variant="outline" size="sm" className="min-h-11">
        <a href={xUrl} target="_blank" rel="noopener noreferrer">
          <Share2 className="size-4" />
          {copy.shareX}
        </a>
      </Button>
    </div>
  );
}
