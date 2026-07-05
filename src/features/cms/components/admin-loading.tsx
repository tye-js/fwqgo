import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";

export function AdminLoading({
  badge = "后台",
  title = "正在加载",
  description = "正在准备后台数据。",
  rows = 6,
}: {
  badge?: string;
  title?: string;
  description?: string;
  rows?: number;
}) {
  return (
    <AdminPageShell
      badge={badge}
      title={title}
      description={description}
      actions={
        <div className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>加载中</span>
        </div>
      }
    >
      <AdminSummaryStrip
        items={[
          { label: "状态", value: "...", note: "读取数据" },
          { label: "队列", value: "...", note: "同步信息" },
          { label: "结果", value: "...", note: "生成视图" },
        ]}
      />
      <AdminSectionCard title="内容加载中" description="正在生成后台页面。">
        <div className="space-y-3">
          {Array.from({ length: rows }, (_, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-md border border-border/60 bg-background/60 p-3 md:grid-cols-[minmax(0,1fr)_140px_120px]"
            >
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
