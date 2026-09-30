import * as cheerio from "cheerio";

import { publicLinkAttributes } from "./link-target";

/** 在公开渲染阶段处理正文链接，保留 href、联盟属性和页内锚点。 */
export function openPublicContentLinksInNewTabs(html: string) {
  const $ = cheerio.load(html, null, false);
  $("a[href]").each((_, element) => {
    const anchor = $(element);
    const attributes = publicLinkAttributes(
      anchor.attr("href"),
      anchor.attr("rel"),
    );
    if (attributes.target) anchor.attr("target", attributes.target);
    else anchor.removeAttr("target");
    if (attributes.rel) anchor.attr("rel", attributes.rel);
  });
  return $.html();
}
