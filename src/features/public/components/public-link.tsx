import NextLink from "next/link";
import type { ComponentProps } from "react";

import { publicLinkAttributes } from "@/features/public/lib/link-target";

/** 声明式 target 在首份 HTML 中生效，无需等待水合或客户端路由。 */
export default function PublicLink({
  href,
  target,
  rel,
  prefetch,
  ...props
}: ComponentProps<typeof NextLink>) {
  const attributes = publicLinkAttributes(href, rel, target);
  return (
    <NextLink
      {...props}
      href={href}
      {...attributes}
      prefetch={attributes.target === "_blank" ? false : prefetch}
    />
  );
}

/** 下载、RSS、外链和短链接保留原生 a，不经过 Next 路由。 */
export function PublicAnchor({
  href,
  target,
  rel,
  ...props
}: ComponentProps<"a">) {
  return (
    <a {...props} href={href} {...publicLinkAttributes(href, rel, target)} />
  );
}
