"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RefreshCw, Save, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  regeneratePostInternalLinksAction,
  updatePostInternalLinkAction,
} from "@/features/cms/actions/post-internal-links";
import type { AdminPostInternalLink } from "@/server/posts/internal-links";

const placementLabels: Record<string, string> = {
  inline: "正文",
  related_knowledge: "相关知识",
  related_post: "相关文章",
  next_step: "下一步",
};

const statusLabels: Record<string, string> = {
  suggested: "待确认",
  approved: "已批准",
  active: "已启用",
  rejected: "已拒绝",
  stale: "已失效",
};

export function PostInternalLinkManager({
  postId,
  links,
}: {
  postId: number;
  links: AdminPostInternalLink[];
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [anchors, setAnchors] = useState<Record<number, string>>({});

  const regenerate = async () => {
    setBusyKey("regenerate");
    try {
      const result = await regeneratePostInternalLinksAction(postId);
      if (result.error || !result.data) {
        toast.error(result.error);
        return;
      }
      toast.success("内链已重新生成", {
        description: `生成 ${result.data.generated} 条，启用 ${result.data.active} 条。`,
      });
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  };

  const updateLink = async (
    link: AdminPostInternalLink,
    status: "suggested" | "active" | "rejected" | "stale",
  ) => {
    setBusyKey(`${link.id}:${status}`);
    try {
      const result = await updatePostInternalLinkAction({
        id: link.id,
        status,
        anchorText: anchors[link.id] ?? link.anchorText,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(status === "active" ? "内链已启用" : "内链状态已更新");
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busyKey !== null}
          onClick={regenerate}
        >
          <RefreshCw
            className={`size-4 ${busyKey === "regenerate" ? "animate-spin" : ""}`}
          />
          重新生成
        </Button>
      </div>

      {links.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          当前没有内链记录，重新生成后正文会优先匹配标签，文章下方再匹配同语言知识和相关文章。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="cms-mobile-sticky-actions w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/70 text-xs text-muted-foreground">
                <th className="px-2 py-2 font-medium">目标</th>
                <th className="w-24 px-2 py-2 font-medium">位置</th>
                <th className="w-52 px-2 py-2 font-medium">锚文本</th>
                <th className="w-20 px-2 py-2 font-medium">评分</th>
                <th className="w-24 px-2 py-2 font-medium">状态</th>
                <th className="w-40 px-2 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id} className="border-b border-border/50 align-top">
                  <td className="px-2 py-3">
                    <p className="font-medium text-foreground">
                      {link.targetTitle}
                    </p>
                    {link.reason ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {link.reason}
                      </p>
                    ) : null}
                    {link.auditIssues.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {link.auditIssues.map((issue) => (
                          <Badge key={issue} variant="destructive">
                            {issue}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-3 text-muted-foreground">
                    {placementLabels[link.placement] ?? link.placement}
                  </td>
                  <td className="px-2 py-2">
                    {link.placement === "inline" ? (
                      <Input
                        value={anchors[link.id] ?? link.anchorText ?? ""}
                        onChange={(event) =>
                          setAnchors((current) => ({
                            ...current,
                            [link.id]: event.target.value,
                          }))
                        }
                        className="min-h-11"
                        aria-label={`修改 ${link.targetTitle} 的锚文本`}
                      />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-2 py-3 tabular-nums">{link.score}</td>
                  <td className="px-2 py-3">
                    <Badge
                      variant={link.status === "active" ? "default" : "secondary"}
                    >
                      {statusLabels[link.status] ?? link.status}
                    </Badge>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      {link.placement === "inline" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="保存并启用"
                          disabled={busyKey !== null || link.auditIssues.length > 0}
                          onClick={() => updateLink(link, "active")}
                        >
                          <Save className="size-4" />
                        </Button>
                      ) : link.status !== "active" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="启用"
                          disabled={busyKey !== null || link.auditIssues.length > 0}
                          onClick={() => updateLink(link, "active")}
                        >
                          <Check className="size-4" />
                        </Button>
                      ) : null}
                      {link.status !== "rejected" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="拒绝"
                          disabled={busyKey !== null}
                          onClick={() => updateLink(link, "rejected")}
                        >
                          <X className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
