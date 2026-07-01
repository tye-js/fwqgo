"use client";

import { useState, useTransition } from "react";
import { DatabaseZap, FileSearch } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import {
  importServerOffersFromPostAction,
  importServerOffersFromPostsAction,
} from "@/features/cms/actions/server-offers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

function describeImportStats(data: ImportStats) {
  return `扫描 ${data.scannedPosts} 篇，提取 ${data.extracted} 条，新增 ${data.inserted} 条，更新 ${data.updated} 条，跳过 ${data.skipped} 条`;
}

export function ServerOfferImporter({ posts }: { posts: ImportPostOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedPostId, setSelectedPostId] = useState(
    posts[0]?.id ? String(posts[0].id) : "",
  );

  function handleImportAll() {
    startTransition(async () => {
      const result = await importServerOffersFromPostsAction();
      if (!result.success) {
        toast.error(result.message ?? result.error);
        return;
      }

      const data = result.data;
      if (!data) {
        toast.error("导入完成但没有返回统计信息");
        return;
      }

      toast.success("历史文章提取完成", {
        description: describeImportStats(data),
      });
      router.refresh();
    });
  }

  function handleImportOne() {
    const postId = Number(selectedPostId);
    if (!Number.isInteger(postId) || postId <= 0) {
      toast.error("请先选择一篇文章");
      return;
    }

    startTransition(async () => {
      const result = await importServerOffersFromPostAction(postId);
      if (!result.success) {
        toast.error(result.message ?? result.error);
        return;
      }

      const data = result.data;
      if (!data) {
        toast.error("提取完成但没有返回统计信息");
        return;
      }

      toast.success("单篇文章提取完成", {
        description: describeImportStats(data),
      });
      router.refresh();
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
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Button
          type="button"
          onClick={handleImportOne}
          disabled={isPending || posts.length === 0}
        >
          <FileSearch className="size-4" />
          {isPending ? "提取中..." : "从选中文章提取"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleImportAll}
          disabled={isPending}
        >
          <DatabaseZap className="size-4" />
          从历史文章批量提取
        </Button>
      </div>
    </div>
  );
}
