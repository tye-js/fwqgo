import Link from "next/link";
import { ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UnifiedTaskActionButtons } from "@/features/cms/components/unified-task-action-buttons";
import { PaginationComponent } from "@/features/shared/components/pagination";
import type {
  UnifiedTaskListResult,
  UnifiedTaskStatusFilter,
  UnifiedTaskType,
} from "@/features/cms/data/operations";

const taskTypeFilters: Array<{ value: UnifiedTaskType; label: string }> = [
  { value: "all", label: "全部任务" },
  { value: "ai", label: "AI改写" },
  { value: "cover", label: "封面生图" },
  { value: "offer", label: "供应商采集" },
];

const statusFilters: Array<{
  value: UnifiedTaskStatusFilter;
  label: string;
}> = [
  { value: "all", label: "全部状态" },
  { value: "active", label: "处理中" },
  { value: "pending", label: "排队" },
  { value: "running", label: "运行中" },
  { value: "failed", label: "失败" },
  { value: "manual_required", label: "需人工" },
  { value: "cancelled", label: "已取消" },
  { value: "succeeded", label: "成功" },
];

const typeLabels: Record<Exclude<UnifiedTaskType, "all">, string> = {
  ai: "AI改写",
  cover: "封面生图",
  offer: "供应商采集",
};

const statusLabels: Record<string, string> = {
  pending: "排队",
  running: "运行中",
  succeeded: "成功",
  failed: "失败",
  manual_required: "需人工",
  cancelled: "已取消",
};

function statusVariant(status: string) {
  if (status === "failed") return "destructive" as const;
  if (status === "succeeded") return "default" as const;
  if (status === "running" || status === "pending") return "secondary" as const;
  return "outline" as const;
}

function buildTaskListHref(input: {
  type: UnifiedTaskType;
  status: UnifiedTaskStatusFilter;
  query: string;
  pageNo?: number;
}) {
  const params = new URLSearchParams();

  if (input.type !== "all") params.set("type", input.type);
  if (input.status !== "all") params.set("status", input.status);
  if (input.query) params.set("query", input.query);
  if (input.pageNo && input.pageNo > 1) {
    params.set("pageNo", String(input.pageNo));
  }

  const queryString = params.toString();
  return queryString ? `/ai-tasks?${queryString}` : "/ai-tasks";
}

function formatTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UnifiedTaskList({ result }: { result: UnifiedTaskListResult }) {
  const { type, status, query, pageNo } = result.filters;

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-md border border-border/70 bg-muted/15 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap gap-1 rounded-md border border-border/70 bg-background p-1">
            {taskTypeFilters.map((item) => (
              <Button
                key={item.value}
                asChild
                size="sm"
                variant={type === item.value ? "secondary" : "ghost"}
                className="rounded-sm"
              >
                <Link
                  href={buildTaskListHref({
                    type: item.value,
                    status,
                    query,
                  })}
                  aria-current={type === item.value ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </Button>
            ))}
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">
            共 {result.totalCount.toLocaleString("zh-CN")} 个任务
          </p>
        </div>

        <form
          action="/ai-tasks"
          method="get"
          className="grid gap-2 md:grid-cols-[minmax(240px,1fr)_180px_auto_auto]"
        >
          <input type="hidden" name="type" value={type === "all" ? "" : type} />
          <div className="relative" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="query"
              defaultValue={query}
              placeholder="搜索任务标题、文章、错误原因或来源"
              maxLength={160}
              className="min-h-11 pl-9"
            />
          </div>
          <Select name="status" defaultValue={status}>
            <SelectTrigger className="min-h-11 w-full" aria-label="任务状态">
              <SelectValue placeholder="选择状态" />
            </SelectTrigger>
            <SelectContent>
              {statusFilters.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="outline" className="min-h-11">
            <SlidersHorizontal className="size-4" />
            应用
          </Button>
          {type !== "all" || status !== "all" || query ? (
            <Button asChild variant="ghost" className="min-h-11">
              <Link href="/ai-tasks">
                <X className="size-4" />
                清除
              </Link>
            </Button>
          ) : (
            <span aria-hidden className="hidden md:block" />
          )}
        </form>
      </div>

      {result.items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background p-6 text-center">
          <p className="text-sm font-medium">当前筛选下没有任务</p>
          <p className="mt-1 text-xs text-muted-foreground">
            可以切换任务类型、状态，或清空搜索关键词。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
          <Table className="min-w-[960px]">
            <TableHeader>
              <TableRow>
                <TableHead>任务</TableHead>
                <TableHead className="w-[180px]">状态与进度</TableHead>
                <TableHead className="w-[220px]">关联文章</TableHead>
                <TableHead className="w-[120px]">更新时间</TableHead>
                <TableHead className="w-[190px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((task) => (
                <TableRow key={task.uid}>
                  <TableCell>
                    <Link
                      href={task.href}
                      className="group flex min-h-11 items-start gap-2 rounded-sm px-1 py-1 hover:bg-muted/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">
                            {typeLabels[task.type]}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            #{task.id} · {task.sourceLabel}
                          </span>
                        </span>
                        <span className="mt-1 line-clamp-2 block text-sm font-medium">
                          {task.title}
                        </span>
                        <span
                          className={
                            task.error
                              ? "mt-1 line-clamp-2 block text-xs leading-5 text-destructive"
                              : "mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground"
                          }
                          title={task.error ?? task.description}
                        >
                          {task.error ?? task.description}
                        </span>
                      </span>
                      <ChevronRight className="mt-1 size-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2.5">
                      <Badge variant={statusVariant(task.status)}>
                        {statusLabels[task.status] ?? task.status}
                      </Badge>
                      {task.status === "pending" ||
                      task.status === "running" ? (
                        <div className="space-y-1.5">
                          <Progress value={task.progress} />
                          <p className="text-xs tabular-nums text-muted-foreground">
                            {task.progress}%
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {task.post ? (
                      <Link
                        href={`/posts/edit/post/${encodeURIComponent(task.post.slug)}`}
                        className="line-clamp-2 min-h-11 rounded-sm px-1 py-1 text-sm hover:bg-muted/50"
                      >
                        <span className="line-clamp-2">{task.post.title}</span>
                        <span className="mt-1 block text-xs uppercase text-muted-foreground">
                          {task.post.language === "en" ? "EN" : "中文"}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatTime(task.updatedAt ?? task.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <UnifiedTaskActionButtons
                      type={task.type}
                      taskId={task.id}
                      status={task.status}
                      canRetry={task.canRetry}
                      canCancel={task.canCancel}
                      canResolve={task.canResolve}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationComponent pageNo={pageNo} totalPage={result.totalPage} />
    </div>
  );
}
