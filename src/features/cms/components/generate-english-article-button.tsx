"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { toast } from "sonner";
import { enqueueEnglishVersionForPostAction } from "@/features/cms/actions/ai-rewrite-task";
import { Button } from "@/components/ui/button";

export function GenerateEnglishArticleButton({
  postId,
  hasUnsavedChanges,
}: {
  postId: number;
  hasUnsavedChanges: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11"
        disabled={pending || hasUnsavedChanges}
        onClick={() =>
          startTransition(async () => {
            try {
              const result = await enqueueEnglishVersionForPostAction(postId);
              if (result.error || !result.data) {
                toast.error(result.error ?? "英文翻译任务创建失败");
                return;
              }
              if (result.data.postSlug) {
                toast.info("已有英文文章，已打开编辑页");
                router.push(
                  `/posts/edit/post/${encodeURIComponent(result.data.postSlug)}`,
                );
                return;
              }
              toast.success("英文翻译已加入后台队列", {
                description: "完成后保存为独立英文草稿，可在任务详情查看进度。",
              });
              router.push(`/ai-tasks/${result.data.taskId}`);
            } catch {
              toast.error("英文翻译任务创建失败，请稍后重试");
            }
          })
        }
      >
        <Languages className="size-4" />
        {pending ? "正在创建..." : "生成英文文章"}
      </Button>
      {hasUnsavedChanges ? (
        <span className="text-xs text-muted-foreground">
          请先保存中文文章的修改
        </span>
      ) : null}
    </div>
  );
}
