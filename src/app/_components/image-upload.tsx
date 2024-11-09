"use client";

import { useState } from "react";
import Image from "next/image";
import { Input } from "@/components/ui/input";

interface ImageUploadProps {
  onChange: (value: string) => void;
  value: string;
}

export function ImageUpload({ onChange, value }: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      // 验证文件类型
      if (!file.type.startsWith("image/")) {
        alert("请上传图片文件");
        return;
      }

      // 验证文件大小 (例如限制为 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert("图片大小不能超过 5MB");
        return;
      }

      setIsUploading(true);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("上传失败");
      const data = (await response.json()) as { url: string };

      // const data = await response.json();
      onChange(data.url);
    } catch (error) {
      console.error("上传错误:", error);
      alert("上传失败，请重试");
    } finally {
      setIsUploading(false);
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
              src={value}
            />
          </div>
        ) : (
          <div className="h-[200px] w-[200px] rounded-md border border-dashed"></div>
        )}
      </div>
      <Input
        type="file"
        accept="image/*"
        onChange={handleUpload}
        disabled={isUploading}
        className="cursor-pointer"
      />
      {isUploading && (
        <p className="text-sm text-muted-foreground">上传中...</p>
      )}
    </div>
  );
}
