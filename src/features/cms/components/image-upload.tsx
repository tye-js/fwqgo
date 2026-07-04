"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ImageLibraryPicker } from "@/features/cms/components/image-library-picker";
import { Button } from "@/components/ui/button";
import { getOptimizedImageSrc } from "@fwqgo/core/image-src";

interface ImageUploadProps {
  onChange: (value: string) => void;
  value: string;
}

export function ImageUpload({ onChange, value }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      // 验证文件类型
      if (!file.type.startsWith("image/")) {
        toast.error("请上传图片文件");
        return;
      }

      // 验证文件大小 (例如限制为 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("图片大小不能超过 5MB");
        return;
      }

      setIsUploading(true);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json().catch(() => null)) as
        | {
            data?: { url?: string };
            url?: string;
            error?: string;
            message?: string;
            actionError?: { message?: string };
          }
        | null;
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
    <div className="flex justify-around gap-8 space-y-4">
      <div className="flex items-center gap-4">
        {value ? (
          <div className="relative h-[200px] w-[200px] overflow-hidden rounded-md">
            <Image
              fill
              sizes="200px"
              className="object-cover"
              alt="Upload"
              src={getOptimizedImageSrc(value)}
            />
          </div>
        ) : (
          <div className="h-[200px] w-[200px] rounded-md border border-dashed"></div>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <Input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          disabled={isUploading}
          className="w-80 cursor-pointer"
        />
        <div className="flex flex-wrap gap-2">
          <ImageLibraryPicker onSelect={onChange} />
          {value ? (
            <Button type="button" variant="ghost" onClick={() => onChange("")}>
              清除
            </Button>
          ) : null}
        </div>
      </div>
      {isUploading && (
        <p className="text-sm text-muted-foreground">上传中...</p>
      )}
    </div>
  );
}
