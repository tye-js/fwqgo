"use client";

import Image from "next/image";
import { useState } from "react";

import {
  getOptimizedImageSrc,
  isRenderableImageSrc,
} from "@fwqgo/core/image-src";

export function SafePostImage({
  src,
  alt,
  sizes,
  priority = false,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!isRenderableImageSrc(src) || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,hsl(var(--muted)),hsl(var(--background)))] px-4 text-center">
        <span className="line-clamp-2 text-xs font-medium leading-5 text-muted-foreground">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={getOptimizedImageSrc(src)}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      loading={priority ? "eager" : "lazy"}
      className="object-cover transition-transform duration-500 group-hover:scale-105"
      onError={() => setFailed(true)}
    />
  );
}
