import type { LinkProps } from "next/link";
import type { HTMLAttributeAnchorTarget } from "react";

/** 页面跳转在新标签打开；页内定位、邮件和电话继续交给浏览器原有行为。 */
export function publicLinkAttributes(
  href: LinkProps["href"] | undefined,
  rel?: string,
  target?: HTMLAttributeAnchorTarget,
) {
  const value = typeof href === "string" ? href.trim() : href?.pathname;
  const pageLink =
    typeof href === "object"
      ? Boolean(value) || Boolean(href.query)
      : Boolean(value && !/^(?:#|mailto:|tel:)/i.test(value));
  const resolvedTarget = target ?? (pageLink ? "_blank" : undefined);
  return {
    target: resolvedTarget,
    rel:
      resolvedTarget === "_blank"
        ? [
            ...new Set([
              ...(rel?.split(/\s+/).filter(Boolean) ?? []),
              "noopener",
              "noreferrer",
            ]),
          ].join(" ")
        : rel,
  };
}
