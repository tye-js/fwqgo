"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Copy, ExternalLink, ImagePlus } from "lucide-react";

import { generateCustomImageAction } from "@/features/cms/actions/custom-image-generation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  describeAdminResult,
  notifyError,
  notifySuccess,
} from "@/lib/admin-toast";

type GeneratedImage = {
  url: string;
  assetId: number;
  prompt: string;
};

export function CustomImageGenerator() {
  const [prompt, setPrompt] = useState("");
  const [fileName, setFileName] = useState("");
  const [altZh, setAltZh] = useState("");
  const [generated, setGenerated] = useState<GeneratedImage | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    if (!prompt.trim()) {
      notifyError({
        title: "请输入生图要求",
        description: "描述图片主体、风格、构图、比例和需要避免的元素。",
      });
      return;
    }

    startTransition(async () => {
      const result = await generateCustomImageAction({
        prompt,
        fileName: fileName || null,
        altZh: altZh || null,
      });

      if (!result.success || !result.url || !result.assetId || !result.prompt) {
        notifyError({
          title: "AI 生图失败",
          description: result.error ?? "接口没有返回可用图片",
        });
        return;
      }

      setGenerated({
        url: result.url,
        assetId: result.assetId,
        prompt: result.prompt,
      });
      notifySuccess({
        title: "AI 图片已生成",
        description: describeAdminResult([
          result.url,
          `图片资产 ID：${result.assetId}`,
        ]),
      });
    });
  }

  async function copyUrl() {
    if (!generated?.url) return;
    try {
      await navigator.clipboard.writeText(generated.url);
      notifySuccess({
        title: "图片 URL 已复制",
        description: generated.url,
      });
    } catch {
      notifyError({
        title: "图片 URL 复制失败",
        description: "请手动复制生成结果中的图片地址。",
      });
    }
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.65fr)]">
      <div className="min-w-0 space-y-4 rounded-md border border-border/70 bg-background p-4">
        <div className="space-y-2">
          <Label htmlFor="custom-image-prompt">生图要求</Label>
          <Textarea
            id="custom-image-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="min-h-56 resize-y"
            placeholder="例如：生成一张用于服务器/VPS 促销文章的横版封面图，科技感、干净背景、包含机房服务器机柜、网络线路光束，不要文字，不要 logo，适合网站首页卡片展示。"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="custom-image-file-name">文件名</Label>
            <Input
              id="custom-image-file-name"
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              placeholder="server-deal-cover"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              建议使用英文，系统会自动转 WebP 并加时间戳。
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-image-alt">Alt 文本</Label>
            <Input
              id="custom-image-alt"
              value={altZh}
              onChange={(event) => setAltZh(event.target.value)}
              placeholder="服务器促销封面图"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/20 px-4 py-3">
          <p className="text-xs leading-5 text-muted-foreground">
            生成结果会自动保存到图片资产，可在文章封面、正文或媒体库中继续使用。
          </p>
          <Button type="button" disabled={isPending} onClick={handleGenerate}>
            <ImagePlus className="size-4" />
            {isPending ? "生成中..." : "生成图片"}
          </Button>
        </div>
      </div>

      <div className="min-w-0 rounded-md border border-border/70 bg-background p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">生成结果</p>
            <p className="mt-1 text-xs text-muted-foreground">
              最近一次生成的图片会显示在这里。
            </p>
          </div>
          {generated ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="复制生成图片 URL"
                title="复制生成图片 URL"
                onClick={copyUrl}
              >
                <Copy className="size-4" />
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link
                  href={generated.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="打开生成图片"
                  title="打开生成图片"
                >
                  <ExternalLink className="size-4" />
                </Link>
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          {generated ? (
            <div className="space-y-3">
              <div className="relative aspect-video overflow-hidden rounded-md border border-border/70 bg-muted">
                <Image
                  src={generated.url}
                  alt={altZh || prompt}
                  fill
                  sizes="(min-width: 1024px) 420px, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="space-y-1 text-xs leading-5 text-muted-foreground">
                <p className="break-all">URL：{generated.url}</p>
                <p>图片资产 ID：{generated.assetId}</p>
              </div>
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/30 text-sm text-muted-foreground">
              等待生成图片
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
