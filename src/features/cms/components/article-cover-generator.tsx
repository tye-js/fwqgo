"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";

import {
  finalizeCoverGenerationBatchAction,
  generateArticleCoverImageAction,
  getCoverGenerationBatchStatusAction,
} from "@/features/cms/actions/article-cover-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  describeAdminResult,
  notifyActionError,
  notifyError,
  notifyInfo,
  notifySuccess,
} from "@/lib/admin-toast";

export function ArticleCoverGenerator({
  postId,
  title,
  description,
  keywords,
  content,
  fileSlug,
  language = "zh",
  onGenerated,
}: {
  postId?: number;
  title: string;
  description?: string | null;
  keywords?: string | null;
  content?: string | null;
  fileSlug?: string | null;
  language?: "zh" | "en";
  onGenerated: (url: string) => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [briefTitle, setBriefTitle] = useState(title);
  const [brands, setBrands] = useState("");
  const [regions, setRegions] = useState("");
  const [productTypes, setProductTypes] = useState("");
  const [specifications, setSpecifications] = useState("");
  const [promotionThemes, setPromotionThemes] = useState("");
  const [forbiddenElements, setForbiddenElements] = useState("");
  const finalizedBatchIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!batchId) return;

    let stopped = false;
    const poll = async () => {
      const result = await getCoverGenerationBatchStatusAction(batchId);
      if (stopped) return;

      if (!result.success) {
        setIsGenerating(false);
        setBatchId(null);
        notifyActionError(
          {
            errorTitle: result.errorTitle ?? "读取封面生成状态失败",
            message: result.error ?? "请刷新页面后重试。",
          },
          { fallbackSuggestion: "可以稍后到 AI 生图或文章编辑页查看结果。" },
        );
        return;
      }

      if (!result.done) {
        return;
      }

      setIsGenerating(false);
      setBatchId(null);
      if (!finalizedBatchIdsRef.current.has(batchId)) {
        const finalizeResult =
          await finalizeCoverGenerationBatchAction(batchId);
        if (stopped) return;

        if (!finalizeResult.success) {
          notifyActionError(
            {
              errorTitle:
                finalizeResult.errorTitle ?? "封面图已生成，但刷新缓存失败",
              message: finalizeResult.error ?? "请刷新页面后确认文章封面。",
            },
            {
              fallbackSuggestion: "可以刷新页面，或到图片管理里确认图片资产。",
            },
          );
        } else {
          finalizedBatchIdsRef.current.add(batchId);
        }
      }

      const generated = result.results?.find((item) => item.url);
      if (generated?.url) {
        onGenerated(generated.url);
        notifySuccess({
          title: "封面图已生成",
          description: describeAdminResult([
            generated.url,
            generated.assetId ? `图片资产 ID：${generated.assetId}` : null,
          ]),
        });
        return;
      }

      const failed = result.results?.find((item) => item.error);
      notifyActionError(
        {
          errorTitle: failed?.errorTitle ?? "封面图生成失败",
          message: failed?.error ?? failed?.errorDetail ?? "请检查生图配置。",
        },
        { fallbackSuggestion: "修正配置后可以重新提交生成任务。" },
      );
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [batchId, onGenerated]);

  async function handleGenerate() {
    if (!title.trim()) {
      notifyError({
        title: "无法生成封面图",
        description: "请先填写文章标题，生图 Prompt 需要标题作为核心主题。",
      });
      return;
    }

    setIsGenerating(true);
    let queued = false;
    try {
      const result = await generateArticleCoverImageAction({
        postId,
        title,
        description,
        keywords,
        content,
        fileSlug,
        language,
        visualBriefOverrides: {
          title: briefTitle,
          brands: splitBriefValues(brands),
          regions: splitBriefValues(regions),
          productTypes: splitBriefValues(productTypes),
          specifications: splitBriefValues(specifications),
          promotionThemes: splitBriefValues(promotionThemes),
          forbiddenElements: splitBriefValues(forbiddenElements),
        },
      });

      if (!result.success) {
        notifyError({
          title: result.errorTitle ?? "生成封面图失败",
          description: result.error ?? "请检查生图配置",
        });
        return;
      }

      if (result.queued) {
        queued = true;
        setDialogOpen(false);
        setBatchId(result.batchId ?? null);
        notifyInfo({
          title: "封面图已加入后台生成队列",
          description: describeAdminResult([
            result.results?.[0]?.taskId
              ? `任务 ID：${result.results[0].taskId}`
              : null,
            postId ? "完成后会自动写回文章封面" : "完成后会回填当前表单",
          ]),
        });
        return;
      }

      notifyError({
        title: "生成封面图失败",
        description: "接口没有创建后台生成任务，请刷新页面后重试。",
      });
    } catch (error) {
      notifyError({
        title: "生成封面图失败",
        description: error instanceof Error ? error.message : "请检查生图配置",
      });
    } finally {
      if (!queued) {
        setIsGenerating(false);
      }
    }
  }

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (open) setBriefTitle(title);
        setDialogOpen(open);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={isGenerating}>
          <ImagePlus className="size-4" />
          {isGenerating ? "后台生成中..." : "生成封面图"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>确认封面视觉简报</DialogTitle>
          <DialogDescription>
            系统会从文章中自动提取明确事实；这里填写的内容会覆盖自动结果。多个值用逗号或换行分隔。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 md:grid-cols-2">
          <BriefField label="标题（核心主题）" value={briefTitle} onChange={setBriefTitle} />
          <BriefField label="品牌" value={brands} onChange={setBrands} />
          <BriefField label="地区" value={regions} onChange={setRegions} />
          <BriefField label="产品类型" value={productTypes} onChange={setProductTypes} />
          <BriefField label="关键规格" value={specifications} onChange={setSpecifications} />
          <BriefField label="促销主题" value={promotionThemes} onChange={setPromotionThemes} />
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="cover-brief-forbidden">附加禁用元素</Label>
            <Textarea
              id="cover-brief-forbidden"
              value={forbiddenElements}
              onChange={(event) => setForbiddenElements(event.target.value)}
              placeholder="例如：人物、硬币、价格文字"
            />
            <p className="text-xs text-muted-foreground">
              系统强制禁用的水印、二维码和相关旗帜元素始终保留。
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={handleGenerate} disabled={isGenerating}>
            <ImagePlus className="size-4" />
            {isGenerating ? "正在创建任务..." : "确认并后台生成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function splitBriefValues(value: string) {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function BriefField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `cover-brief-${label}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
