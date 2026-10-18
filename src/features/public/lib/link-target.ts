import type { LinkProps } from "next/link";
import type { HTMLAttributeAnchorTarget } from "react";

/**
 * `/servers` 是比价工具，页面里大量是筛选、排序、分页和专题这类**原地跳转**。
 * 按默认策略每个都新开标签页，用户的标签栏很快会被同一个工具页塞满。
 *
 * 所以**在工具页里**且目标仍在工具内时，链接留在当前标签：工具内部的导航不算
 * 「离开页面」。真正的离开仍然新开——购买（外链）、去文章/分类，以及站点外的地址。
 *
 * 判断必须同时看**当前页**和**目标页**：只按目标地址判断的话，文章页、分类页底部
 * 那种「相关套餐」入口也会被算成工具内导航，读者点一下就把正在看的文章弄丢了。
 * 所以这个豁免由 `/servers` 子树显式开启（见 `stayInTool`），其它页面保持站点默认。
 */
const SERVER_TOOL_PATH = /^\/servers(?:[/?#]|$)/;

/**
 * 页面跳转在新标签打开；页内定位、邮件和电话继续交给浏览器原有行为。
 *
 * @param stayInTool 当前页就是 `/servers` 工具时传 `true`。
 */
export function publicLinkAttributes(
  href: LinkProps["href"] | undefined,
  rel?: string,
  target?: HTMLAttributeAnchorTarget,
  stayInTool = false,
) {
  const value = typeof href === "string" ? href.trim() : href?.pathname;
  const pageLink =
    typeof href === "object"
      ? Boolean(value) || Boolean(href.query)
      : Boolean(value && !/^(?:#|mailto:|tel:)/i.test(value));
  const staysInTool = stayInTool && SERVER_TOOL_PATH.test(value ?? "");
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
