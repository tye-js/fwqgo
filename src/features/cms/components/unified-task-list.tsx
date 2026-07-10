import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  { value: "offer", label: "套餐提取" },
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
  offer: "套餐提取",
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
    <div className="space-y-4">
      <div className="rounded-md border border-border/70 bg-muted/15 p-3">
        <form
          action="/ai-tasks"
          method="get"
          className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]"
        >
          <input type="hidden" name="type" value={type === "all" ? "" : type} />
          <input
            type="hidden"
            name="status"
            value={status === "all" ? "" : status}
          />
          <div className="relative" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="query"
              defaultValue={query}
              placeholder="搜索任务标题、文章、错误原因或来源"
              className="min-h-11 pl-9"
            />
          </div>
          <Button type="submit" variant="outline">
            搜索任务
          </Button>
        </form>

        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {taskTypeFilters.map((item) => (
              <Button
                key={item.value}
                asChild
                size="sm"
                variant={type === item.value ? "default" : "outline"}
              >
                <Link
                  href={buildTaskListHref({
                    type: item.value,
                    status,
                    query,
                  })}
                >
                  {item.label}
                </Link>
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {statusFilters.map((item) => (
              <Button
                key={item.value}
                asChild
                size="sm"
                variant={status === item.value ? "default" : "outline"}
              >
                <Link
                  href={buildTaskListHref({
                    type,
                    status: item.value,
                    query,
                  })}
                >
                  {item.label}
                </Link>
              </Button>
            ))}
          </div>
        </div>
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
          <Table className="min-w-[1120px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[320px]">任务</TableHead>
                <TableHead className="w-[150px]">状态</TableHead>
                <TableHead className="w-[130px]">进度</TableHead>
                <TableHead className="w-[260px]">说明 / 错误</TableHead>
                <TableHead className="w-[180px]">关联文章</TableHead>
                <TableHead className="w-[120px]">更新时间</TableHead>
                <TableHead className="w-[210px] text-right">操作</TableHead>
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
                            #{task.id}
                          </span>
                        </span>
                        <span className="mt-1 line-clamp-2 block text-sm font-medium">
                          {task.title}
                        </span>
                      </span>
                      <ExternalLink className="mt-1 size-4 shrink-0 opacity-60 group-hover:opacity-100" />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={statusVariant(task.status)}>
                        {statusLabels[task.status] ?? task.status}
                      </Badge>
                      <Badge variant="outline">{task.sourceLabel}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Progress value={task.progress} />
                      <p className="text-xs text-muted-foreground">
                        {task.progress}%
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p
                      className={
                        task.error
                          ? "line-clamp-3 text-xs leading-5 text-destructive"
                          : "line-clamp-3 text-xs leading-5 text-muted-foreground"
                      }
                    >
                      {task.error ?? task.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    {task.post ? (
                      <Link
                        href={`/posts/edit/post/${encodeURIComponent(task.post.slug)}`}
                        className="line-clamp-2 min-h-11 rounded-sm px-1 py-1 text-sm hover:bg-muted/50"
                      >
                        {task.post.title}
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
