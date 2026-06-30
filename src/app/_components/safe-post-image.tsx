"use client";

import Image from "next/image";
import { useState } from "react";

import { getOptimizedImageSrc } from "@/lib/image-src";

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

  if (!src || failed) {
    return (
      <div className="h-full w-full bg-[linear-gradient(135deg,hsl(var(--muted)),hsl(var(--background)))]" />
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
