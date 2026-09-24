"use client";

import Image from "next/image";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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
import {
  ARTICLE_IMAGE_ACCEPT,
  localizedArticleImageAlt,
  type PendingArticleImage,
  uploadArticleImageFile,
} from "@/features/cms/lib/article-image-upload";

export type ArticleImageInserterHandle = {
  /**
   * 外部把已上传的图片送进弹窗并打开它。
   *
   * 目前由编辑器的**粘贴截图**调用：粘贴是事件、打开弹窗是命令式动作，
   * 用句柄比「prop 变化 → effect 里同步 state」直接，也不会触发级联渲染。
   */
  openWithImage: (image: PendingArticleImage) => void;
};

export const ArticleImageInserter = forwardRef<
  ArticleImageInserterHandle,
  {
    language: "zh" | "en";
    /** 由编辑器注入：把图片语法插到光标处。 */
    onInsert: (markdown: string) => void;
  }
>(function ArticleImageInserter({ language, onInsert }, ref) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [alt, setAlt] = useState("");
  const [pending, setPending] = useState<PendingArticleImage | null>(null);

  function reset() {
    setCaption("");
    setAlt("");
    setPending(null);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /** 选中图片时同步预填 alt，之后是否改动交给操作者。 */
  const applyPending = useCallback(
    (image: PendingArticleImage) => {
      setPending(image);
      setAlt(localizedArticleImageAlt(image, language));
    },
    [language],
  );

  useImperativeHandle(
    ref,
    () => ({
      openWithImage(image: PendingArticleImage) {
        applyPending(image);
        setOpen(true);
      },
    }),
    [applyPending],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      applyPending(await uploadArticleImageFile(file));
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
        alt: alt.trim().length ? alt.trim() : localizedArticleImageAlt(pending, language),
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
              accept={ARTICLE_IMAGE_ACCEPT}
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
});
