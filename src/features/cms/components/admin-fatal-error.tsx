"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { describeAdminError } from "@/features/cms/lib/describe-error";

/**
 * 后台**外壳自己**加载失败时的兜底页。
 *
 * 挂载点：`apps/cms/app/error.tsx`（比 `(admin)` 段更靠外一层）。
 *
 * ## 为什么还需要这一层
 *
 * 实测过：把数据库停掉后，先挂的是 `apps/cms/app/(admin)/layout.tsx` —— 它要
 * `requireAdminSession()`，会话校验就得查库。而 `error.tsx` **接不住同层 layout 的错误**，
 * 所以 `(admin)/error.tsx` 在「数据库连不上」这个最现实的场景里根本轮不到，
 * 页面直接掉到框架默认的 "This page couldn't load"。
 *
 * 分层：
 * - `(admin)/error.tsx` → 页面级错误，**保留侧栏**，管理员可以直接换页继续干活。
 * - 这里 → 外壳级错误（layout 挂了），侧栏渲染不出来，所以只能是一张独立整页；
 *   但因为渲染在根 layout 之内，`cms.css` 与 Tailwind 样式仍然可用。
 */
export function AdminFatalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("后台外壳加载失败:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-foreground">
              后台暂时无法加载
            </h1>
            <p className="text-xs text-muted-foreground">
              连后台外壳都没渲染出来，通常是数据库连接断开或迁移未完成。
            </p>
          </div>
        </div>

        <p className="break-words rounded-md bg-muted/40 p-3 text-sm text-destructive">
          {describeAdminError(error)}
        </p>

        {error.digest ? (
          <p className="break-all text-xs text-muted-foreground">
            错误标识：{error.digest}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={reset}>
            <RotateCcw className="size-4" aria-hidden="true" />
            重试
          </Button>
          <Button asChild variant="outline">
            <Link href="/">回到工作台</Link>
          </Button>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          排查顺序：确认 PostgreSQL 在跑 → 确认最新迁移已执行 →
          看 CMS 进程日志（`pm2 logs fwqgo-cms`）。
        </p>
      </div>
    </div>
  );
}
