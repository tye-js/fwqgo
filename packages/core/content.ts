import * as cheerio from "cheerio";

import { slugify } from "@fwqgo/core/utils";

function getHeadingId(text: string, usedIds: Map<string, number>) {
  const baseId = slugify(text) || "section";
  const currentCount = usedIds.get(baseId) ?? 0;
  usedIds.set(baseId, currentCount + 1);

  return currentCount === 0 ? baseId : `${baseId}-${currentCount + 1}`;
}

export function normalizeArticleHtml(content: string) {
  const $ = cheerio.load(content, null, false);
  const usedIds = new Map<string, number>();

  $("h2, h3, h4, h5, h6").each((_, element) => {
    const $heading = $(element);
    const headingText = $heading.text().trim();

    if (!headingText) {
      $heading.removeAttr("id");
      return;
    }

    $heading.attr("id", getHeadingId(headingText, usedIds));
  });

  return $.html();
}
