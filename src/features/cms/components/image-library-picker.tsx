"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Images, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { getImageAssetPickerOptions } from "@/features/cms/actions/images";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getOptimizedImageSrc } from "@fwqgo/core/image-src";

type PickerImage = {
  id: number;
  path: string;
  thumbPath: string | null;
  originalName: string;
};

export function ImageLibraryPicker({
  onSelect,
  triggerLabel = "从图片库选择",
}: {
  onSelect: (path: string) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [images, setImages] = useState<PickerImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const timeoutId = window.setTimeout(
      () => {
        setIsLoading(true);
        void getImageAssetPickerOptions(query)
          .then((result) => {
            if (!cancelled) setImages(result.data);
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            toast.error("读取图片库失败", {
              description:
                error instanceof Error ? error.message : "请稍后重试。",
            });
          })
          .finally(() => {
            if (!cancelled) setIsLoading(false);
          });
      },
      query.trim() ? 350 : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [open, query]);

  function handleSelect(path: string) {
    onSelect(path);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Images className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>选择图片</DialogTitle>
          <DialogDescription>
            从已入库图片中选择一张作为文章封面。
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Label htmlFor="image-library-search" className="sr-only">
            搜索图片
          </Label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="image-library-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文件名或 URL"
            className="pl-10"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3" role="status" aria-live="polite">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                正在读取图片库
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 8 }, (_, index) => (
                  <div
                    key={index}
                    className="overflow-hidden rounded-md border border-border/70 bg-background"
                  >
                    <Skeleton className="aspect-video w-full rounded-none" />
                    <div className="space-y-2 p-3">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : images.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {query.trim() ? "没有匹配的图片" : "图片库暂无可用图片"}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  className="overflow-hidden rounded-md border border-border/70 bg-background text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={`选择图片：${image.originalName}`}
                  onClick={() => handleSelect(image.path)}
                >
                  <div className="relative aspect-video bg-muted">
                    <Image
                      src={getOptimizedImageSrc(image.thumbPath ?? image.path)}
                      alt={image.originalName}
                      fill
                      sizes="240px"
                      className="object-cover"
                    />
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="truncate text-sm font-medium">
                      {image.originalName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {image.path}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
