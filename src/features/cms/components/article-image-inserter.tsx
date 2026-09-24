"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { buildArticleImageMarkdown } from "@fwqgo/core/article-image-syntax";
import { getOptimizedImageSrc } from "@fwqgo/core/image-src";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ImageLibraryPicker } from "@/features/cms/components/image-library-picker";

/** 图片库里还没有 alt 文案时，用文件名兜底——与上传接口的 fallbackImageAlt 同规则。 */
function fallbackAlt(originalName: string) {
  return (
    originalName
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "article image"
  );
}

type PendingImage = {
  path: string;
  altZh: string | null;
  altEn: string | null;
  originalName: string;
};

/**
 * alt 的预填值：图片库的双语文案 → 文件名。
 *
 * 图片库里的 alt 是**封面语境**的文章标题文案（例如「Zgovps VPS 套餐评测：香港三网直连…」），
 * 直接拿来当正文图的 alt 并不贴切——正文图该描述图片本身。所以这里只做预填，
 * 操作者可以在弹窗里改掉。
 */
function localizedAlt(image: PendingImage, language: "zh" | "en") {
  const localized = (language === "en" ? image.altEn : image.altZh)?.trim();
  return localized?.length ? localized : fallbackAlt(image.originalName);
}

export function ArticleImageInserter({
  language,
  onInsert,
}: {
  language: "zh" | "en";
  /** 由编辑器注入：把图片语法插到光标处。 */
  onInsert: (markdown: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [alt, setAlt] = useState("");
  const [pending, setPending] = useState<PendingImage | null>(null);

  function reset() {
    setCaption("");
    setAlt("");
    setPending(null);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /** 选中图片时同步预填 alt，之后是否改动交给操作者。 */
  function applyPending(image: PendingImage) {
    setPending(image);
    setAlt(localizedAlt(image, language));
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast.error("图片大小不能超过 8MB");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as {
        data?: {
          url?: string;
          asset?: { altZh?: string | null; altEn?: string | null };
        };
        url?: string;
        error?: string;
        message?: string;
        actionError?: { message?: string };
      } | null;
      const uploadedPath = data?.data?.url ?? data?.url;

      if (!response.ok || !uploadedPath) {
        throw new Error(
          data?.actionError?.message ??
            data?.message ??
            data?.error ??
            `上传失败，HTTP ${response.status}`,
        );
      }

      applyPending({
        path: uploadedPath,
        altZh: data?.data?.asset?.altZh ?? null,
        altEn: data?.data?.asset?.altEn ?? null,
        originalName: file.name,
      });
      toast.success("图片已上传，确认后插入正文");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败，请重试");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleInsert() {
    if (!pending) {
      toast.error("请先上传图片或从图片库选择");
      return;
    }

    onInsert(
      buildArticleImageMarkdown({
        src: pending.path,
        // 操作者清空 alt 时回退到预填值：正文图始终带 alt，不留空。
        alt: alt.trim().length ? alt.trim() : localizedAlt(pending, language),
        caption: caption.trim(),
      }),
    );
    setOpen(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <ImagePlus className="size-3.5" />
          插入图片
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>插入正文图片</DialogTitle>
          <DialogDescription>
            图片存入站内图片库并转为 WebP；正文写入 Markdown 图片语法，前台按设备宽度自动选图。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="article-image-caption">图注（可选）</Label>
            <Input
              id="article-image-caption"
              value={caption}
              // 图片语法的图注放在双引号 title 槽位，双引号会提前闭合它。
              // 这里直接不接受，避免产生保存后无法还原的内容。
              onChange={(event) =>
                setCaption(event.target.value.replace(/"/g, ""))
              }
              maxLength={120}
              placeholder="例如：三节点部署拓扑"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              图注显示在图片下方，最多 120 字，不能包含英文双引号。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="article-image-alt">替代文本 alt（可选）</Label>
            <Input
              id="article-image-alt"
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              maxLength={300}
              placeholder="描述这张图本身，供读屏与搜索引擎使用"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              选中图片时会自动填入图片库里的双语说明。若那是文章标题式的文案，建议改成描述这张图本身；
              留空则沿用自动填入的值。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="article-image-file">本地上传</Label>
            <Input
              id="article-image-file"
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleUpload}
              disabled={isUploading}
              className="cursor-pointer"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              JPEG、PNG、WebP 会转为 WebP，GIF 保留原格式，单张最大 8MB。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ImageLibraryPicker
              description="从已入库图片中选择一张插入正文。"
              onSelect={(_path, image) => {
                applyPending({
                  path: image.path,
                  altZh: image.altZh,
                  altEn: image.altEn,
                  originalName: image.originalName,
                });
              }}
            />
            {isUploading ? (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                上传并转换中
              </span>
            ) : null}
          </div>

          {pending ? (
            <div className="flex items-start gap-3 rounded-md border border-border/70 bg-muted/15 p-3">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-md border border-border/70 bg-muted">
                <Image
                  src={getOptimizedImageSrc(pending.path)}
                  alt="待插入图片预览"
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">已选择图片</p>
                <p className="break-all text-xs leading-5 text-muted-foreground">
                  {pending.path}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleInsert}
            disabled={!pending || isUploading}
          >
            插入到正文
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
