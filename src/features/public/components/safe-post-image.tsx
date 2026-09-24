"use client";

import Image from "next/image";
import { useState } from "react";
import { hasRenderableCover } from "@fwqgo/core/article-cover";
import { ServerCoverArt } from "./server-cover-art";

import { getOptimizedImageSrc } from "@fwqgo/core/image-src";

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
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;

  if (!hasRenderableCover(src) || failed) {
    return <ServerCoverArt />;
  }

  return (
    <Image
      src={getOptimizedImageSrc(src)}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      quality={75}
      className="object-cover transition-transform duration-300 group-hover:scale-[1.025]"
      onError={() => setFailedSrc(src)}
    />
  );
}
