import { Compass, Files, Hash } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function formatCount(value: number, language: "zh" | "en") {
  return value.toLocaleString(language === "en" ? "en-US" : "zh-CN");
}

export default function PageCard({
  kind = "专题",
  name,
  description,
  totalCount,
  pageNo,
  language = "zh",
  variant = "card",
}: {
  kind?: string;
  name: string;
  description: string;
  totalCount?: number;
  pageNo?: number;
  language?: "zh" | "en";
  variant?: "card" | "compact";
}) {
  if (variant === "compact") {
    return (
      <header className="border-b border-border/70 pb-5 pt-2 md:pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{kind}</Badge>
          {typeof pageNo === "number" ? (
            <Badge variant="outline">
              {language === "en" ? `Page ${pageNo}` : `第 ${pageNo} 页`}
            </Badge>
          ) : null}
        </div>
        <h1 className="font-editorial mt-3 max-w-4xl text-3xl font-semibold leading-tight text-foreground md:text-4xl">
          {name}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
          {description}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2 tabular-nums">
            <Files className="size-4" aria-hidden="true" />
            {formatCount(totalCount ?? 0, language)}
            {language === "en" ? " published articles" : " 篇已发布文章"}
          </span>
          <span className="inline-flex items-center gap-2">
            <Hash className="size-4" aria-hidden="true" />
            {language === "en" ? "Topic collection" : "主题内容聚合"}
          </span>
        </div>
      </header>
    );
  }

  return (
    <Card className="overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm">
      <CardContent className="p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{kind}</Badge>
          {typeof pageNo === "number" ? (
            <Badge variant="outline">
              {language === "en" ? `Page ${pageNo}` : `第 ${pageNo} 页`}
            </Badge>
          ) : null}
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
          <div className="space-y-3">
            <h1 className="font-editorial max-w-4xl text-3xl font-semibold leading-tight text-foreground md:text-4xl">
              {name}
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
              {description}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-md border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Files className="size-3.5" />
                {language === "en" ? "Content size" : "内容规模"}
              </div>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {formatCount(totalCount ?? 0, language)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {language === "en" ? "published articles" : "已收录文章"}
              </p>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Compass className="size-3.5" />
                {language === "en" ? "Content focus" : "内容方向"}
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">
                {language === "en" ? "Article first" : "内容优先"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {language === "en"
                  ? "Browse grouped article collections"
                  : "以文章为主的聚合浏览"}
              </p>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Hash className="size-3.5" />
                {language === "en" ? "Browsing tip" : "浏览建议"}
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">
                {language === "en" ? "Start from the top" : "先看前几篇"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {language === "en"
                  ? "Then continue by page"
                  : "再按分页继续深入"}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
