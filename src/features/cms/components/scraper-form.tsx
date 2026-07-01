"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { type Tag } from "@/features/cms/routes/end/posts/create/page";
import {
  getAiRewriteStyleOptions,
  scrapeArticleAction,
  type ScrapeActionState,
} from "@/features/cms/actions/scrape";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const initialState: ScrapeActionState = {
  success: false,
  data: null,
  error: null,
};

export function ScraperForm({
  setContent,
  setTitle,
  setDescription,
  setKeywords,
  setRecommendTag,
  setTags,
}: {
  setContent: (content: string) => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setKeywords: (keywords: string[]) => void;
  setRecommendTag: (recommendTag: Tag) => void;
  setTags: (tags: Tag[]) => void;
}) {
  const [rewriteStyles, setRewriteStyles] = useState<
    Awaited<ReturnType<typeof getAiRewriteStyleOptions>>
  >([]);
  const [state, formAction, isPending] = useActionState(
    scrapeArticleAction,
    initialState,
  );

  useEffect(() => {
    getAiRewriteStyleOptions()
      .then(setRewriteStyles)
      .catch((error) => {
        console.error("Failed to load AI rewrite styles:", error);
      });
  }, []);

  useEffect(() => {
    if (state.success && state.data) {
      setContent(state.data.htmlContent);
      setTitle(state.data.title);
      setDescription(state.data.description);
      setKeywords(state.data.keywords);
      setRecommendTag({ name: state.data.recommendTagName });
      setTags(state.data.tagsName.map((name: string) => ({ name })));
      toast.success("文章抓取成功");
    } else if (state.error) {
      toast.error("抓取失败：" + state.error);
    }
  }, [state, setContent, setTitle, setDescription, setKeywords, setRecommendTag, setTags]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <form action={formAction} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_auto]">
        <Input
          type="url"
          name="url"
          placeholder="输入要抓取的网页 URL"
          required
        />
        <Select name="rewriteStyleId" disabled={rewriteStyles.length === 0}>
          <SelectTrigger>
            <SelectValue
              placeholder={
                rewriteStyles.length > 0 ? "改写风格" : "未配置 AI"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {rewriteStyles.map((style) => (
              <SelectItem key={style.id} value={String(style.id)}>
                {style.styleName}
                {style.isDefault ? "（默认）" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={isPending}>
          {isPending ? "抓取改写中..." : "开始抓取并改写"}
        </Button>
      </form>
      {state.success && state.data?.diagnostics ? (
        <ScrapeDiagnosticsPanel diagnostics={state.data.diagnostics} />
      ) : null}
    </div>
  );
}

function ScrapeDiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: NonNullable<ScrapeActionState["data"]>["diagnostics"];
}) {
  const report = diagnostics.affiliateReport;
  const unmatchedHosts = [
    ...new Set(report.unmatchedLinks.map((item) => item.host).filter(Boolean)),
  ];

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{diagnostics.strategy}</Badge>
        {diagnostics.usedFallback ? <Badge variant="outline">通用采集</Badge> : null}
        {diagnostics.usedPuppeteer ? <Badge variant="outline">浏览器渲染</Badge> : null}
        {diagnostics.usedAiRewrite ? <Badge variant="outline">AI 改写</Badge> : null}
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
            {[...new Set(report.matchedLinks.map((item) => item.providerName))].map(
              (name) => (
                <Badge key={name}>{name}</Badge>
              ),
            )}
          </div>
        </div>
      ) : null}
      {unmatchedHosts.length > 0 ? (
        <div className="mt-3 space-y-1">
          <p className="text-sm font-medium text-foreground">未配置返利的外链域名</p>
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
    </div>
  );
}
