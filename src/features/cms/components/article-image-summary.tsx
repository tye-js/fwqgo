"use client";

import Image from "next/image";
import { AlertTriangle, Images } from "lucide-react";

import { parseArticleImages } from "@fwqgo/core/article-image-syntax";
import { getOptimizedImageSrc } from "@fwqgo/core/image-src";

/**
 * 正文图片清单：把 Markdown 里引用的图片连同缩略图、alt、图注列出来。
 *
 * 存在的理由：正文编辑器是纯 Markdown 文本域，后台又完全不渲染正文 HTML
 * （`src/features/cms` 里没有任何 `dangerouslySetInnerHTML`），所以操作者插入
 * 图片之后在后台看不到它，只能发布到前台才知道效果。这条清单用最小的代价
 * 补上「我看得见自己插了什么」。
 *
 * 顺带把**会被前台净化掉的外链图**显式标出来。净化器只放行同源 `/uploads/`，
 * 外链图在渲染时被静默丢弃——静默才是真正的问题，这里让它可见。
 */
export function ArticleImageSummary({
  content,
  onLocate,
}: {
  content: string;
  /** 点击缩略图时把光标定位到该图片语法。 */
  onLocate?: (range: { index: number; length: number }) => void;
}) {
  const images = parseArticleImages(content);

  // 绝大多数文章没有正文图片，不要平白多出一块区域。
  if (images.length === 0) return null;

  const externalCount = images.filter(
    (image) => !image.src.startsWith("/uploads/"),
  ).length;

  return (
    <section
      className="mt-3 rounded-md border border-border/70 bg-muted/15 p-3"
      aria-label="正文图片清单"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
        <Images className="size-3.5" aria-hidden />
        <span>正文图片 {images.length} 张</span>
        {externalCount > 0 ? (
          <span className="text-destructive">
            其中 {externalCount} 张是外链图，前台会被丢弃
          </span>
        ) : null}
        {onLocate ? (
          <span className="font-normal">点击缩略图可在正文里定位</span>
        ) : null}
      </div>

      <ul className="mt-2 flex gap-3 overflow-x-auto pb-1">
        {images.map((image) => {
          const isLocal = image.src.startsWith("/uploads/");

          return (
            <li
              key={`${image.index}-${image.src}`}
              className="w-32 shrink-0"
            >
              <button
                type="button"
                className="block w-full overflow-hidden rounded-md border border-border/70 bg-background text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() =>
                  onLocate?.({ index: image.index, length: image.raw.length })
                }
                aria-label={`定位到正文图片：${image.alt || image.src}`}
              >
                <span className="relative block aspect-video bg-muted">
                  {isLocal ? (
                    <Image
                      src={getOptimizedImageSrc(image.src)}
                      alt={image.alt || "正文图片"}
                      fill
                      sizes="128px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center gap-1 px-2 text-center text-xs leading-tight text-destructive">
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                      外链图，前台会丢弃
                    </span>
                  )}
                </span>
                <span className="block space-y-0.5 p-2">
                  <span className="block truncate text-xs font-medium text-foreground">
                    {image.caption || image.alt || "无说明"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {image.src}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
