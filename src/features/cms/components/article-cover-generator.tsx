"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";

import {
  finalizeCoverGenerationBatchAction,
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
  fileSlug,
  language = "zh",
  currentCoverUrl,
  onGenerated,
}: {
  postId?: number;
  title: string;
  description?: string | null;
  fileSlug?: string | null;
  language?: "zh" | "en";
  currentCoverUrl: string;
  onGenerated: (url: string) => void;
}) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const finalizedBatchIdsRef = useRef(new Set<string>());
  const currentCoverRef = useRef(currentCoverUrl);
  const requestedCoverRef = useRef(currentCoverUrl);

  useEffect(() => {
    currentCoverRef.current = currentCoverUrl;
  }, [currentCoverUrl]);

  useEffect(() => {
    if (!batchId) return;

    let stopped = false;
    let timer: number | undefined;
    const poll = async () => {
      let done = false;
      try {
        const result = await getCoverGenerationBatchStatusAction(batchId);
        if (stopped) return;

        if (!result.success) {
          done = true;
          notifyActionError(
            {
              errorTitle: result.errorTitle ?? "读取封面生成状态失败",
              message: result.error ?? "请刷新页面后重试。",
            },
            { fallbackSuggestion: "可以稍后到 AI 生图或文章编辑页查看结果。" },
          );
          return;
        }

        if (!result.done) return;
        done = true;
        if (!finalizedBatchIdsRef.current.has(batchId)) {
          const finalizeResult =
            await finalizeCoverGenerationBatchAction(batchId);
          if (stopped) return;

          if (!finalizeResult.success) {
            notifyActionError(
              {
                errorTitle:
                  finalizeResult.errorTitle ?? "封面图已生成，但刷新缓存失败",
                message: finalizeResult.error ?? "请刷新页面后确认文章封面。",
              },
              {
                fallbackSuggestion:
                  "可以刷新页面，或到图片管理里确认图片资产。",
              },
            );
          } else {
            finalizedBatchIdsRef.current.add(batchId);
          }
        }

        const generated = result.results?.find(
          (item) =>
            item.success && item.url && (!postId || item.postId === postId),
        );
        if (generated?.url) {
          if (
            (postId && !generated.appliedToPost) ||
            currentCoverRef.current !== requestedCoverRef.current
          ) {
            notifyInfo({
              title: "封面图已生成，已保留当前选择的封面",
              description: "生成图片已存入图片管理，可按需选择使用。",
            });
          } else {
            onGenerated(generated.url);
            if (postId) router.refresh();
            notifySuccess({
              title: "封面图已生成",
              description: describeAdminResult([
                generated.url,
                generated.assetId ? `图片资产 ID：${generated.assetId}` : null,
              ]),
            });
          }
          return;
        }

        const failed = result.results?.find(
          (item) => item.error && (!postId || item.postId === postId),
        );
        notifyActionError(
          {
            errorTitle: failed?.errorTitle ?? "封面图生成失败",
            message: failed?.error ?? failed?.errorDetail ?? "请检查生图配置。",
          },
          { fallbackSuggestion: "修正配置后可以重新提交生成任务。" },
        );
      } catch {
        done = true;
        if (!stopped) {
          notifyError({
            title: "读取封面生成状态失败",
            description: "后台任务会继续运行，请稍后到任务中心查看结果。",
          });
        }
      } finally {
        if (!stopped) {
          if (done) {
            setIsGenerating(false);
            setBatchId(null);
          } else {
            timer = window.setTimeout(() => void poll(), 3000);
          }
        }
      }
    };

    void poll();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [batchId, onGenerated, postId, router]);

  async function handleGenerate() {
    if (!title.trim()) {
      notifyError({
        title: "无法生成封面图",
        description: "请先填写文章标题。",
      });
      return;
    }

    if (!description?.trim()) {
      notifyError({
        title: "无法生成封面图",
        description: "请先填写文章描述，封面会根据该描述和 AI 生图配置生成。",
      });
      return;
    }

    requestedCoverRef.current = currentCoverUrl;
    setIsGenerating(true);
    let queued = false;
    try {
      const result = await generateArticleCoverImageAction({
        postId,
        title,
        description,
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
      className="min-h-11"
      disabled={isGenerating}
      onClick={handleGenerate}
      title="根据当前文章描述和 AI 生图配置生成封面"
    >
      <ImagePlus className="size-4" />
      {isGenerating ? "后台生成中..." : "生成封面图"}
    </Button>
  );
}
