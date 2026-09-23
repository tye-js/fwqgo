"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { describeAdminError } from "@/features/cms/lib/describe-error";

/**
 * 后台的兜底错误页。
 *
 * 挂载点：`apps/cms/app/(admin)/error.tsx`。它是 Next 的错误边界，**渲染在 admin layout 之内**
 * —— 侧栏、顶栏、面包屑都还在，管理员可以直接换一个页面继续工作，而不是掉到框架默认错误页。
 *
 * 两层错误处理的分工（别混）：
 * - **页面内单块数据失败** → 用 `loadPageData`（`@/features/cms/lib/page-data`）降级渲染，
 *   只把那一块换成「读不到 + 怎么办」的提示，其余部分照常可用。
 * - **整页渲染失败**（连页面外壳都出不来）→ 落到这里。
 */
export function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("后台页面渲染失败:", error);
  }, [error]);

  return (
    <AdminPageShell
      badge="后台"
      title="这个页面没能加载出来"
      description="页面在服务端渲染时出错。多数情况是数据库连接抖动、迁移没跑完或慢查询超时；稍后重试通常就能恢复。"
      actions={
        <>
          <Button type="button" onClick={reset}>
            <RotateCcw className="size-4" aria-hidden="true" />
            重试
          </Button>
          <Button asChild variant="outline">
            <Link href="/">回到工作台</Link>
          </Button>
        </>
      }
    >
      <AdminSectionCard
        title="错误详情"
        description="把这段信息连同出错时间一起记下来，排查服务端日志时能对上。"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <div className="min-w-0 space-y-2">
            <p className="break-words text-sm text-destructive">
              {describeAdminError(error)}
            </p>
            {error.digest ? (
              <p className="break-all text-xs text-muted-foreground">
                错误标识：{error.digest}
              </p>
            ) : null}
          </div>
        </div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
