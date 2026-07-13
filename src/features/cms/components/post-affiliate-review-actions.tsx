"use client";

import { RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  approvePostAffiliateReviewAction,
  reviewPostAffiliateLinksAction,
} from "@/features/cms/actions/post";
import {
  describeAdminResult,
  notifyActionError,
  notifyInfo,
  notifySuccess,
} from "@/lib/admin-toast";
import { cn } from "@fwqgo/core/utils";

export function PostAffiliateReviewActions({
  postId,
  postTitle,
  status,
  className,
}: {
  postId: number;
  postTitle: string;
  status: string;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (status === "passed") return null;

  function handleReview() {
    startTransition(async () => {
      const result = await reviewPostAffiliateLinksAction(postId);
      if (result.error || !result.data) {
        notifyActionError(result, {
          title: "返利链接检查失败",
          fallbackSuggestion: "请确认正文可读取，并检查返利商家配置。",
        });
        return;
      }

      const description = describeAdminResult([
        `文章：${postTitle}`,
        `命中 ${result.data.matchedCount} 条`,
        `未命中 ${result.data.unmatchedCount} 条（保留原链接）`,
        `无效 ${result.data.invalidCount} 条`,
      ]);

      if (result.data.status === "manual_required") {
        notifyInfo({
          title: "检查完成，需要人工确认",
          description,
        });
      } else {
        notifySuccess({
          title: "返利检查已通过",
          description,
        });
      }
      router.refresh();
    });
  }

  function handleApprove() {
    startTransition(async () => {
      const result = await approvePostAffiliateReviewAction(postId);
      if (result.error || !result.data) {
        notifyActionError(result, {
          title: "人工确认失败",
          fallbackSuggestion: "请刷新页面后重试，正文修改后需要重新确认。",
        });
        return;
      }

      notifySuccess({
        title: "返利检查已人工通过",
        description: describeAdminResult([
          `文章：${postTitle}`,
          `确认人：${result.data.approvedBy}`,
          `未命中 ${result.data.unmatchedCount} 条（保留原链接）`,
          result.data.invalidCount > 0
            ? `已确认 ${result.data.invalidCount} 条特殊或无效链接`
            : "当前没有无效链接",
          "正文再次修改后会自动回到待检查状态",
        ]),
      });
      router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={handleReview}
      >
        <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
        {isPending ? "检查中" : "重新检查"}
      </Button>

      {status === "manual_required" ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isPending}
            >
              <ShieldCheck className="size-4" />
              人工通过
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>人工通过当前正文的返利检查？</AlertDialogTitle>
              <AlertDialogDescription className="leading-6">
                未命中的有效外链会保留原
                URL，本身不需要人工放行。该操作用于确认当前正文中的无效或特殊链接可以照常发布；正文再次修改后，审核状态会自动重置为待检查。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleApprove}>
                确认人工通过
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
