"use client";

import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { notifyError, notifySuccess } from "@/lib/admin-toast";

export function CoverTaskPromptCopy({
  prompt,
  compact = false,
}: {
  prompt: string | null;
  /**
   * 文章详情页的「AI 生图提示词」栏用紧凑版：只占一栏高度，
   * 任务详情页仍用完整版，便于逐行核对。
   */
  compact?: boolean;
}) {
  const normalizedPrompt = prompt?.trim() ?? "";

  async function copyPrompt() {
    if (!normalizedPrompt) return;

    try {
      await navigator.clipboard.writeText(normalizedPrompt);
      notifySuccess({
        title: "生图提示词已复制",
        description: "可直接粘贴到其他生图工具继续生成。",
      });
    } catch {
      notifyError({
        title: "复制生图提示词失败",
        description: "请选中下方完整提示词后手动复制。",
      });
    }
  }

  if (!normalizedPrompt) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-3 text-sm leading-6 text-muted-foreground">
        {compact
          ? "该文章还没有保存过生图提示词。执行一次 AI 生图后，系统会在调用生图接口前保存完整提示词。"
          : "该任务在生成提示词前失败，或属于尚未保存提示词的历史任务。重新执行后，系统会在调用生图接口前保存完整提示词。"}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-6 text-muted-foreground">
          {compact
            ? "这是最近一次生图使用的完整提示词，可直接复制到其他生图工具。"
            : "这是任务最后一次生图尝试使用的完整提示词。"}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={copyPrompt}>
          <Copy className="size-4" />
          复制提示词
        </Button>
      </div>
      <Textarea
        aria-label="AI 生图提示词"
        readOnly
        value={normalizedPrompt}
        className={
          compact
            ? "min-h-24 resize-y font-mono text-xs leading-5"
            : "min-h-64 resize-y font-mono text-xs leading-5"
        }
        onFocus={(event) => event.currentTarget.select()}
      />
    </div>
  );
}
