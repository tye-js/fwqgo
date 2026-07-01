import { Compass, Files, Hash } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function formatCount(value: number) {
  return value.toLocaleString("zh-CN");
}

export default function PageCard({
  kind = "专题",
  name,
  description,
  totalCount,
  pageNo,
}: {
  kind?: string;
  name: string;
  description: string;
  totalCount?: number;
  pageNo?: number;
}) {
  return (
    <Card className="overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm">
      <CardContent className="p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-primary text-primary-foreground">{kind}</Badge>
          {typeof pageNo === "number" ? (
            <Badge variant="secondary">第 {pageNo} 页</Badge>
          ) : null}
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-4">
            <h1 className="font-editorial max-w-4xl text-4xl font-semibold leading-tight text-foreground md:text-5xl">
              {name}
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
              {description}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <Files className="size-3.5" />
                内容规模
              </div>
              <p className="mt-3 text-2xl font-semibold text-foreground">
                {formatCount(totalCount ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">已收录文章</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <Compass className="size-3.5" />
                内容方向
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">
                内容优先
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                以文章为主的聚合浏览
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <Hash className="size-3.5" />
                浏览建议
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">
                先看前几篇
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                再按分页继续深入
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
