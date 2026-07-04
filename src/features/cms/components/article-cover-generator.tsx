"use client";

import { useEffect, useState } from "react";
import { ImagePlus } from "lucide-react";

import {
  generateArticleCoverImageAction,
  getCoverGenerationBatchStatusAction,
} from "@/features/cms/actions/article-cover-image";
import { Button } from "@/components/ui/button";
import {
  describeAdminResult,
  notifyActionError,
  notifyError,
  notifyInfo,
  notifySuccess,
} from "@/lib/admin-toast";

export function ArticleCoverGenerator({
  postId,
  title,
  description,
  keywords,
  content,
  fileSlug,
  language = "zh",
  onGenerated,
}: {
  postId?: number;
  title: string;
  description?: string | null;
  keywords?: string | null;
  content?: string | null;
  fileSlug?: string | null;
  language?: "zh" | "en";
  onGenerated: (url: string) => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);

  useEffect(() => {
    if (!batchId) return;

    let stopped = false;
    const poll = async () => {
      const result = await getCoverGenerationBatchStatusAction(batchId);
      if (stopped) return;

      if (!result.success) {
        setIsGenerating(false);
        setBatchId(null);
        notifyActionError(
          {
            errorTitle: result.errorTitle ?? "读取封面生成状态失败",
            message: result.error ?? "请刷新页面后重试。",
          },
          { fallbackSuggestion: "可以稍后到 AI 生图或文章编辑页查看结果。" },
        );
        return;
      }

      if (!result.done) {
        return;
      }

      setIsGenerating(false);
      setBatchId(null);
      const generated = result.results?.find((item) => item.url);
      if (generated?.url) {
        onGenerated(generated.url);
        notifySuccess({
          title: "封面图已生成",
          description: describeAdminResult([
            generated.url,
            generated.assetId ? `图片资产 ID：${generated.assetId}` : null,
          ]),
        });
        return;
      }

      const failed = result.results?.find((item) => item.error);
      notifyActionError(
        {
          errorTitle: failed?.errorTitle ?? "封面图生成失败",
          message: failed?.error ?? failed?.errorDetail ?? "请检查生图配置。",
        },
        { fallbackSuggestion: "修正配置后可以重新提交生成任务。" },
      );
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [batchId, onGenerated]);

  async function handleGenerate() {
    if (!title.trim()) {
      notifyError({
        title: "无法生成封面图",
        description: "请先填写文章标题，生图 Prompt 需要标题作为核心主题。",
      });
      return;
    }

    setIsGenerating(true);
    let queued = false;
    try {
      const result = await generateArticleCoverImageAction({
        postId,
        title,
        description,
        keywords,
        content,
        fileSlug,
        language,
      });

      if (!result.success) {
        notifyError({
          title: result.errorTitle ?? "生成封面图失败",
          description: result.error ?? "请检查生图配置",
        });
        return;
      }

      if (result.queued) {
        queued = true;
        setBatchId(result.batchId ?? null);
        notifyInfo({
          title: "封面图已加入后台生成队列",
          description: describeAdminResult([
            result.results?.[0]?.taskId
              ? `任务 ID：${result.results[0].taskId}`
              : null,
            postId ? "完成后会自动写回文章封面" : "完成后会回填当前表单",
          ]),
        });
        return;
      }

      notifyError({
        title: "生成封面图失败",
        description: "接口没有创建后台生成任务，请刷新页面后重试。",
      });
    } catch (error) {
      notifyError({
        title: "生成封面图失败",
        description: error instanceof Error ? error.message : "请检查生图配置",
      });
    } finally {
      if (!queued) {
        setIsGenerating(false);
      }
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
      {isGenerating ? "后台生成中..." : "生成封面图"}
    </Button>
  );
}
