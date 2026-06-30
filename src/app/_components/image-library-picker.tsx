"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Images, Search } from "lucide-react";
import { toast } from "sonner";

import { getImageAssets } from "@/app/_actions/images";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { type ImageAssetWithReferences } from "@/app/_components/image-asset-manager";
import { getOptimizedImageSrc } from "@/lib/image-src";

export function ImageLibraryPicker({
  onSelect,
  triggerLabel = "从图片库选择",
}: {
  onSelect: (path: string) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [images, setImages] = useState<ImageAssetWithReferences[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || images.length > 0) return;

    startTransition(() => {
      void getImageAssets()
        .then((result) => {
          setImages(result.data);
        })
        .catch(() => {
          toast.error("读取图片库失败");
        });
    });
  }, [images.length, open]);

  const filteredImages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return images;

    return images.filter(
      (image) =>
        image.path.toLowerCase().includes(normalizedQuery) ||
        image.originalName.toLowerCase().includes(normalizedQuery),
    );
  }, [images, query]);

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
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文件名或 URL"
            className="pl-10"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {isPending ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              加载中...
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              没有匹配的图片
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {filteredImages.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  className="overflow-hidden rounded-lg border border-border/70 bg-background text-left transition-colors hover:border-accent"
                  onClick={() => handleSelect(image.path)}
                >
                  <div className="relative aspect-[4/3] bg-muted">
                    <Image
                      src={getOptimizedImageSrc(image.path)}
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
