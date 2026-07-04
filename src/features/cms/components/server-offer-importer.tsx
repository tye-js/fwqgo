"use client";

import { useEffect, useState, useTransition } from "react";
import { DatabaseZap, FileSearch } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  getServerOfferImportTaskStatusAction,
  importServerOffersFromPostAction,
  importServerOffersFromPostsAction,
} from "@/features/cms/actions/server-offers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  describeAdminResult,
  notifyActionError,
  notifyInfo,
  notifySuccess,
} from "@/lib/admin-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ImportPostOption = {
  id: number;
  title: string;
  slug: string;
  published: boolean;
  createdAt: Date;
};

type ImportStats = {
  scannedPosts: number;
  extracted: number;
  inserted: number;
  updated: number;
  skipped: number;
};

type ImportTask = {
  taskId: number;
  mode: "single" | "bulk";
  status: "pending" | "running" | "succeeded" | "failed";
  progress: number;
  message: string | null;
  result: ImportStats | null;
  done: boolean;
  errorTitle?: string;
  errorDetail?: string;
};

function describeImportStats(data: ImportStats) {
  return `扫描 ${data.scannedPosts} 篇，提取 ${data.extracted} 条，新增 ${data.inserted} 条，更新 ${data.updated} 条，跳过 ${data.skipped} 条`;
}

export function ServerOfferImporter({ posts }: { posts: ImportPostOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedPostId, setSelectedPostId] = useState(
    posts[0]?.id ? String(posts[0].id) : "",
  );
  const [activeTask, setActiveTask] = useState<ImportTask | null>(null);
  const isTaskRunning =
    activeTask?.status === "pending" || activeTask?.status === "running";

  useEffect(() => {
    if (!activeTask || activeTask.done) return;

    let stopped = false;
    let notifiedDone = false;
    const poll = async () => {
      const result = await getServerOfferImportTaskStatusAction(
        activeTask.taskId,
      );
      if (stopped) return;

      if (!result.success) {
        notifyActionError(result, {
          fallbackSuggestion: "请刷新页面后重试。",
        });
        return;
      }

      setActiveTask(result.data);
      if (result.data.done && !notifiedDone) {
        notifiedDone = true;
        if (result.data.status === "succeeded" && result.data.result) {
          notifySuccess({
            title:
              result.data.mode === "bulk"
                ? "历史文章提取完成"
                : "单篇文章提取完成",
            description: describeImportStats(result.data.result),
          });
          router.refresh();
          return;
        }

        notifyActionError(
          {
            errorTitle: result.data.errorTitle ?? "套餐提取失败",
            message: result.data.errorDetail ?? "请查看服务器日志。",
          },
          { fallbackSuggestion: "修正文章内容或提取规则后可以重新提交任务。" },
        );
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeTask, router]);

  function handleImportAll() {
    startTransition(async () => {
      const result = await importServerOffersFromPostsAction();
      if (!result.success) {
        notifyActionError(result);
        return;
      }

      setActiveTask(result.data);
      notifyInfo({
        title: "历史文章提取已加入后台队列",
        description: describeAdminResult([
          `任务 ID ${result.data.taskId}`,
          "可以停留本页查看进度",
        ]),
      });
    });
  }

  function handleImportOne() {
    const postId = Number(selectedPostId);
    if (!Number.isInteger(postId) || postId <= 0) {
      notifyActionError(
        { error: "请选择文章", message: "请先选择一篇文章后再提取套餐。" },
        { fallbackSuggestion: "如果列表为空，请先创建或抓取文章。" },
      );
      return;
    }

    startTransition(async () => {
      const result = await importServerOffersFromPostAction(postId);
      if (!result.success) {
        notifyActionError(result);
        return;
      }

      setActiveTask(result.data);
      notifyInfo({
        title: "单篇文章提取已加入后台队列",
        description: describeAdminResult([
          `任务 ID ${result.data.taskId}`,
          "后台会解析表格、正文段落和购买链接",
        ]),
      });
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="space-y-2">
        <Label htmlFor="server-offer-import-post">选择单篇文章</Label>
        <Select value={selectedPostId} onValueChange={setSelectedPostId}>
          <SelectTrigger id="server-offer-import-post" className="min-h-10">
            <SelectValue placeholder="选择要提取套餐的文章" />
          </SelectTrigger>
          <SelectContent>
            {posts.map((post) => (
              <SelectItem key={post.id} value={String(post.id)}>
                {post.title}
                {post.published ? "" : "（草稿）"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          单篇提取适合刚发布或刚改写的文章。系统会优先解析文章表格，再回退到正文段落。
        </p>
        {activeTask ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs">
            <Badge variant={activeTask.status === "failed" ? "destructive" : "outline"}>
              任务 #{activeTask.taskId}
            </Badge>
            <span className="text-muted-foreground">
              {activeTask.message ?? "等待处理"} · {activeTask.progress}%
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Button
          type="button"
          onClick={handleImportOne}
          disabled={isPending || isTaskRunning || posts.length === 0}
        >
          <FileSearch className="size-4" />
          {isPending || isTaskRunning ? "后台提取中..." : "从选中文章提取"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleImportAll}
          disabled={isPending || isTaskRunning}
        >
          <DatabaseZap className="size-4" />
          从历史文章批量提取
        </Button>
      </div>
    </div>
  );
}
