"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  getScrapeArticleJobStatusAction,
  scrapeArticleAction,
  type ScrapeActionState,
} from "@/features/cms/actions/scrape";
import { Badge } from "@/components/ui/badge";
import { notifyActionError, notifyInfo } from "@/lib/admin-toast";

const initialState: ScrapeActionState = {
  success: false,
  data: null,
  error: null,
};

type ScrapeDiagnostics = NonNullable<ScrapeActionState["data"]>["diagnostics"];

export function ScraperForm({
  setContent,
}: {
  setContent: (content: string) => void;
}) {
  const [completedJobId, setCompletedJobId] = useState<string | null>(null);
  const [lastDiagnostics, setLastDiagnostics] =
    useState<ScrapeDiagnostics | null>(null);
  const [state, formAction, isPending] = useActionState(
    scrapeArticleAction,
    initialState,
  );
  const activeJobId =
    state.queued && state.jobId && completedJobId !== state.jobId
      ? state.jobId
      : null;
  const isScraping = isPending || Boolean(activeJobId);

  const applyScrapedArticle = useCallback(
    (article: NonNullable<ScrapeActionState["data"]>) => {
      setContent(article.htmlContent);
      setLastDiagnostics(article.diagnostics);
    },
    [setContent],
  );

  useEffect(() => {
    if (state.queued && state.jobId) {
      notifyInfo({
        title: "抓取任务已进入后台",
        description: state.message ?? "完成后会自动填入当前文章表单。",
      });
      return;
    }

    if (state.error) {
      notifyActionError(
        { ...state, error: state.error ?? undefined },
        {
          title: "抓取失败",
          fallbackSuggestion:
            "请检查来源 URL 是否可访问，或改用文章生产台准备素材。",
        },
      );
    }
  }, [state]);

  useEffect(() => {
    if (!activeJobId) return;

    let cancelled = false;
    const jobId = activeJobId;

    async function pollJobStatus() {
      try {
        const result = await getScrapeArticleJobStatusAction(jobId);
        if (cancelled) return;

        if (result.status === "success" && result.data) {
          applyScrapedArticle(result.data);
          setCompletedJobId(jobId);
          toast.success("文章抓取成功", {
            description: "清洗后的原文已填入正文；请人工填写标题和 SEO。",
          });
          return;
        }

        if (result.status === "failed" || result.error) {
          setCompletedJobId(jobId);
          notifyActionError(
            { ...result, error: result.error ?? undefined },
            {
              title: "抓取失败",
              fallbackSuggestion:
                "请检查来源 URL 是否可访问，或改用文章生产台准备素材。",
            },
          );
        }
      } catch (error) {
        if (cancelled) return;
        setCompletedJobId(jobId);
        notifyActionError(
          {
            error:
              error instanceof Error ? error.message : "读取抓取任务状态失败",
          },
          {
            title: "抓取状态读取失败",
            fallbackSuggestion: "请刷新页面后重新提交抓取任务。",
          },
        );
      }
    }

    void pollJobStatus();
    const intervalId = window.setInterval(() => {
      void pollJobStatus();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeJobId, applyScrapedArticle]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <form
        action={formAction}
        className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]"
      >
        <Input
          type="url"
          name="url"
          placeholder="输入要抓取的网页 URL"
          required
        />

        <Button type="submit" disabled={isScraping}>
          {isScraping ? "后台抓取中..." : "开始抓取正文"}
        </Button>
      </form>
      {activeJobId ? (
        <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          抓取任务正在后台执行，可以继续编辑其他字段，完成后会自动填入表单。
        </div>
      ) : null}
      {!activeJobId && lastDiagnostics ? (
        <ScrapeDiagnosticsPanel diagnostics={lastDiagnostics} />
      ) : null}
    </div>
  );
}

function ScrapeDiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: ScrapeDiagnostics;
}) {
  const report = diagnostics.affiliateReport;
  const unmatchedHosts = [
    ...new Set(report.unmatchedLinks.map((item) => item.host).filter(Boolean)),
  ];

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{diagnostics.strategy}</Badge>
        {diagnostics.usedFallback ? (
          <Badge variant="outline">通用采集</Badge>
        ) : null}
        {diagnostics.usedPuppeteer ? (
          <Badge variant="outline">浏览器渲染</Badge>
        ) : null}
        {diagnostics.usedAiRewrite ? (
          <Badge variant="outline">AI 改写</Badge>
        ) : null}
      </div>
      <div className="mt-3 grid gap-3 text-sm text-muted-foreground md:grid-cols-4">
        <p>正文长度：{diagnostics.contentLength}</p>
        <p>链接总数：{report.totalLinks}</p>
        <p>返利命中：{report.matchedLinks.length}</p>
        <p>未命中：{report.unmatchedLinks.length}</p>
      </div>
      {report.matchedLinks.length > 0 ? (
        <div className="mt-3 space-y-1">
          <p className="text-sm font-medium text-foreground">命中的返利商家</p>
          <div className="flex flex-wrap gap-2">
            {[
              ...new Set(report.matchedLinks.map((item) => item.providerName)),
            ].map((name) => (
              <Badge key={name}>{name}</Badge>
            ))}
          </div>
        </div>
      ) : null}
      {unmatchedHosts.length > 0 ? (
        <div className="mt-3 space-y-1">
          <p className="text-sm font-medium text-foreground">
            未配置返利的外链域名
          </p>
          <div className="flex flex-wrap gap-2">
            {unmatchedHosts.slice(0, 12).map((host) => (
              <Badge key={host} variant="outline">
                {host}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {diagnostics.warnings.length > 0 ? (
        <div className="mt-3 text-sm text-amber-600">
          {diagnostics.warnings.join("；")}
        </div>
      ) : null}
      {diagnostics.removedContentPatterns?.length ? (
        <div className="mt-3 space-y-1">
          <p className="text-sm font-medium text-foreground">语义清洗</p>
          <div className="flex flex-wrap gap-2">
            {diagnostics.removedContentPatterns.map((pattern) => (
              <Badge key={pattern} variant="outline">
                {pattern}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
