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
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="size-11 px-0 text-muted-foreground hover:bg-muted hover:text-primary sm:h-11 sm:w-auto sm:px-2.5"
        aria-label={copy.copy}
        onClick={copyUrl}
      >
        <Copy className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{copy.copy}</span>
      </Button>
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="size-11 px-0 text-muted-foreground hover:bg-muted hover:text-primary sm:h-11 sm:w-auto sm:px-2.5"
      >
        <a
          href={xUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={copy.shareX}
        >
          <Share2 className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{copy.shareX}</span>
        </a>
      </Button>
    </div>
  );
}
