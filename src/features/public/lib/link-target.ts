import type { LinkProps } from "next/link";
import type { HTMLAttributeAnchorTarget } from "react";

/**
 * `/servers` 是比价工具，页面里大量是筛选、排序、分页和专题这类**原地跳转**。
 * 按默认策略每个都新开标签页，用户的标签栏很快会被同一个工具页塞满。
 *
 * 所以这一类链接留在当前标签：工具内部的导航不该算「离开页面」。
 * 真正的离开仍然新开——购买（外链）、去文章/分类，以及站点外的地址。
 */
const SERVER_TOOL_PATH = /^\/servers(?:[/?#]|$)/;

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
  const staysInTool = SERVER_TOOL_PATH.test(value ?? "");
  const resolvedTarget =
    target ?? (pageLink && !staysInTool ? "_blank" : undefined);
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
