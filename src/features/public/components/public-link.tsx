import NextLink from "next/link";
import type { ComponentProps } from "react";

import { publicLinkAttributes } from "@/features/public/lib/link-target";

/** `/servers` 工具页专用：目标仍在工具内时留在当前标签，离开工具才新开。 */
type ToolScopeProps = {
  stayInTool?: boolean;
};

/** 声明式 target 在首份 HTML 中生效，无需等待水合或客户端路由。 */
export default function PublicLink({
  href,
  target,
  rel,
  prefetch,
  stayInTool,
  ...props
}: ComponentProps<typeof NextLink> & ToolScopeProps) {
  const attributes = publicLinkAttributes(href, rel, target, stayInTool);
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
  stayInTool,
  ...props
}: ComponentProps<"a"> & ToolScopeProps) {
  return (
    <a
      {...props}
      href={href}
      {...publicLinkAttributes(href, rel, target, stayInTool)}
    />
  );
}
