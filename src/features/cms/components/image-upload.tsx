"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ImageLibraryPicker } from "@/features/cms/components/image-library-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  getOptimizedImageSrc,
  isRenderableImageSrc,
} from "@fwqgo/core/image-src";
import { ImageIcon, Loader2 } from "lucide-react";

interface ImageUploadProps {
  onChange: (value: string) => void;
  value: string;
}

export function ImageUpload({ onChange, value }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const hasPreview = isRenderableImageSrc(value);
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      // 验证文件类型
      if (!file.type.startsWith("image/")) {
        toast.error("请上传图片文件");
        return;
      }

      if (file.size > 8 * 1024 * 1024) {
        toast.error("图片大小不能超过 8MB");
        return;
      }

      setIsUploading(true);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json().catch(() => null)) as {
        data?: { url?: string };
        url?: string;
        error?: string;
        message?: string;
        actionError?: { message?: string };
      } | null;
      const uploadedUrl = data?.data?.url ?? data?.url;

      if (!response.ok || !uploadedUrl) {
        throw new Error(
          data?.actionError?.message ??
            data?.message ??
            data?.error ??
            `上传失败，HTTP ${response.status}`,
        );
      }

      // const data = await response.json();
      onChange(uploadedUrl);
      toast.success("封面图片上传成功", {
        description: uploadedUrl,
      });
    } catch (error) {
      console.error("上传错误:", error);
      toast.error(error instanceof Error ? error.message : "上传失败，请重试");
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(220px,0.72fr)_minmax(0,1fr)] md:items-start">
      <div className="min-w-0">
        {hasPreview ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border/70 bg-muted">
            <Image
              fill
              sizes="(min-width: 768px) 360px, 100vw"
              className="object-cover"
              alt="文章封面预览"
              src={getOptimizedImageSrc(value)}
            />
          </div>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/30 text-muted-foreground">
            <ImageIcon className="size-8" aria-hidden />
            <span className="sr-only">未设置封面图片</span>
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="post-cover-url">封面 URL</Label>
          <Input
            id="post-cover-url"
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="/uploads/example.webp"
          />
          {value && !hasPreview ? (
            <p className="text-xs leading-5 text-destructive">
              当前地址无法预览，请填写完整的 http(s) URL 或 /uploads/ 路径。
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="post-cover-file">本地上传</Label>
          <Input
            id="post-cover-file"
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleUpload}
            disabled={isUploading}
            className="cursor-pointer"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            JPEG、PNG、WebP 会自动转为 WebP，GIF 保留原格式，单张最大 8MB。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImageLibraryPicker onSelect={onChange} />
          {value ? (
            <Button type="button" variant="ghost" onClick={() => onChange("")}>
              清除封面
            </Button>
          ) : null}
          {isUploading ? (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              上传并转换中
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
