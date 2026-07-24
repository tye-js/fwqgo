"use client";

import { Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { notifyError, notifySuccess } from "@/lib/admin-toast";

export type AiRewriteAuditArtifact = {
  id: number;
  taskAttempt: number;
  stage: string;
  stageName: string;
  stageAttempt: number;
  status: string;
  configSnapshot: string | null;
  model: string | null;
  maxTokens: number | null;
  temperature: number | null;
  prompt: string | null;
  promptLength: number | null;
  promptTruncated: boolean;
  response: string | null;
  responseLength: number | null;
  responseTruncated: boolean;
  readableContent: string | null;
  readableContentLength: number | null;
  readableContentTruncated: boolean;
  metadata: string | null;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  error: string | null;
  startedAt: Date | string;
  finishedAt: Date | string | null;
};

const stageLabels: Record<string, string> = {
  fact_extraction: "来源事实提取",
  content_generation: "中文候选正文",
  quality_review: "事实质量审查",
  metadata_generation: "中文 SEO 元信息",
  english_content_generation: "英文正文",
  english_continuation: "英文正文续写",
  english_metadata_generation: "英文 SEO 元信息",
};

const statusLabels: Record<string, string> = {
  running: "调用中",
  success: "成功",
  retry: "未通过，已重试",
  failed: "失败",
};

const statusVariants: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  running: "secondary",
  success: "default",
  retry: "secondary",
  failed: "destructive",
};

function formatTime(value: Date | string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatJson(value: string | null) {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function stageContentLabel(stage: string) {
  if (stage === "content_generation") return "人工阅读候选正文";
  if (stage === "quality_review") return "人工阅读审查结果";
  if (stage === "fact_extraction") return "人工阅读事实包";
  if (stage.includes("metadata")) return "人工阅读元信息结果";
  return "人工阅读输出";
}

async function copyText(value: string, title: string) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    notifySuccess({ title, description: "内容已复制到剪贴板。" });
  } catch {
    notifyError({
      title: "复制失败",
      description: "请在下方文本框中手动选择并复制。",
    });
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!value}
      onClick={() => void copyText(value, `${label}已复制`)}
    >
      <Copy className="size-4" />
      复制{label}
    </Button>
  );
}

function AuditArtifact({ artifact }: { artifact: AiRewriteAuditArtifact }) {
  const readableContent = artifact.readableContent ?? "";
  const prompt = artifact.prompt ?? "";
  const response = artifact.response ?? "";
  const metadata = formatJson(artifact.metadata);
  const configSnapshot = formatJson(artifact.configSnapshot);
  const isRejected =
    artifact.status === "retry" || artifact.status === "failed";

  return (
    <details
      open={artifact.stage === "content_generation" || isRejected}
      className="border-b border-border/70 py-4 first:pt-0 last:border-b-0 last:pb-0"
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {stageLabels[artifact.stage] ?? artifact.stageName}
          </span>
          <Badge variant={statusVariants[artifact.status] ?? "outline"}>
            {statusLabels[artifact.status] ?? artifact.status}
          </Badge>
          <Badge variant="outline">
            任务第 {artifact.taskAttempt} 次 · 阶段第 {artifact.stageAttempt} 次
          </Badge>
          {artifact.model ? (
            <Badge variant="outline">{artifact.model}</Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {formatTime(artifact.finishedAt ?? artifact.startedAt)}
          </span>
        </div>
        {isRejected ? (
          <p className="mt-2 text-xs leading-5 text-amber-700">
            这是未通过审查或调用失败的中间结果，仅供人工核对，不可直接发布。
          </p>
        ) : null}
      </summary>

      <div className="mt-4 space-y-4">
        {artifact.error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm leading-6 text-destructive">
            {artifact.error}
          </p>
        ) : null}

        {readableContent ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {stageContentLabel(artifact.stage)}
              </p>
              <CopyButton value={readableContent} label="可读内容" />
            </div>
            <Textarea
              readOnly
              value={readableContent}
              aria-label={stageContentLabel(artifact.stage)}
              className="min-h-64 resize-y font-mono text-xs leading-6"
              onFocus={(event) => event.currentTarget.select()}
            />
            {artifact.readableContentTruncated ? (
              <p className="text-xs text-amber-700">
                审计仅保留前 {readableContent.length} 个字符，原始输出长度为
                {artifact.readableContentLength ?? "-"} 字符。
              </p>
            ) : null}
          </div>
        ) : null}

        <details className="rounded-md border border-border/70 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            查看实际提示词
          </summary>
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {artifact.promptLength ?? 0} 字符
                {artifact.promptTruncated ? " · 已按审计上限截断" : ""}
              </span>
              <CopyButton value={prompt} label="提示词" />
            </div>
            <Textarea
              readOnly
              value={prompt}
              aria-label="实际提示词"
              className="min-h-56 resize-y font-mono text-xs leading-5"
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        </details>

        {response && response !== readableContent ? (
          <details className="rounded-md border border-border/70 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              查看原始模型响应
            </summary>
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {artifact.responseLength ?? 0} 字符
                  {artifact.responseTruncated ? " · 已按审计上限截断" : ""}
                </span>
                <CopyButton value={response} label="原始响应" />
              </div>
              <Textarea
                readOnly
                value={response}
                aria-label="原始模型响应"
                className="min-h-48 resize-y font-mono text-xs leading-5"
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
          </details>
        ) : null}

        {metadata ? (
          <details className="rounded-md border border-border/70 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              查看审计元数据
            </summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs leading-5">
              {metadata}
            </pre>
          </details>
        ) : null}

        <p className="text-xs text-muted-foreground">
          prompt tokens {artifact.promptTokens ?? "-"} · completion tokens{" "}
          {artifact.completionTokens ?? "-"} · total{" "}
          {artifact.totalTokens ?? "-"} · finish_reason{" "}
          {artifact.finishReason ?? "-"} · Max Tokens{" "}
          {artifact.maxTokens ?? "-"}
        </p>
        {configSnapshot ? (
          <details className="rounded-md border border-border/70 p-3">
            <summary className="cursor-pointer text-xs font-medium">
              查看本次调用的配置快照（不含 API Key）
            </summary>
            <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs leading-5">
              {configSnapshot}
            </pre>
          </details>
        ) : null}
      </div>
    </details>
  );
}

export function AiRewriteAuditViewer({
  artifacts,
}: {
  artifacts: AiRewriteAuditArtifact[];
}) {
  if (artifacts.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm leading-6 text-muted-foreground">
        当前任务还没有保存模型调用审计。旧任务的中间正文无法补回，重新执行后会从第一步开始记录提示词和每轮候选结果。
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/70">
      {artifacts.map((artifact) => (
        <AuditArtifact key={artifact.id} artifact={artifact} />
      ))}
    </div>
  );
}
