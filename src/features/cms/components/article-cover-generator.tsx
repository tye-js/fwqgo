"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";

import { generateArticleCoverImageAction } from "@/features/cms/actions/article-cover-image";
import { Button } from "@/components/ui/button";
import {
  describeAdminResult,
  notifyError,
  notifySuccess,
} from "@/lib/admin-toast";

export function ArticleCoverGenerator({
  title,
  description,
  keywords,
  content,
  onGenerated,
}: {
  title: string;
  description?: string | null;
  keywords?: string | null;
  content?: string | null;
  onGenerated: (url: string) => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerate() {
    if (!title.trim()) {
      notifyError({
        title: "无法生成封面图",
        description: "请先填写文章标题，生图 Prompt 需要标题作为核心主题。",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateArticleCoverImageAction({
        title,
        description,
        keywords,
        content,
      });

      if (!result.success || !result.url) {
        notifyError({
          title: "生成封面图失败",
          description: result.error ?? "接口没有返回可用图片地址",
        });
        return;
      }

      onGenerated(result.url);
      notifySuccess({
        title: "封面图已生成",
        description: describeAdminResult([
          result.url,
          `图片资产 ID：${result.assetId}`,
        ]),
      });
    } catch (error) {
      notifyError({
        title: "生成封面图失败",
        description: error instanceof Error ? error.message : "请检查生图配置",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9"
      disabled={isGenerating}
      onClick={handleGenerate}
    >
      <ImagePlus className="size-4" />
      {isGenerating ? "生成中..." : "生成封面图"}
    </Button>
  );
}
