import assert from "node:assert/strict";
import path from "node:path";
import * as cheerio from "cheerio";

/**
 * The reserved build parameter intentionally renders notFound(), whose Next.js
 * error document can omit title/description/canonical. It must remain noindex;
 * published article metadata must still be present in the initial head.
 * @param {string} relativePath
 * @param {string} html
 */
export function checkPrerenderedArticleMetadata(relativePath, html) {
  const isPlaceholder =
    path.basename(relativePath) === "__fwqgo_article_static_shell__.html";
  const initialHead = /<head\b[^>]*>[\s\S]*?<\/head\s*>/i.exec(html)?.[0];
  assert.ok(initialHead, `${relativePath} omitted its initial head`);
  const $ = cheerio.load(initialHead);

  if (isPlaceholder) {
    const noindex = $('meta[name="robots"]')
      .toArray()
      .some((element) =>
        ($(element).attr("content") ?? "")
          .toLowerCase()
          .split(/[\s,]+/)
          .includes("noindex"),
      );
    assert.ok(
      noindex,
      `${relativePath} omitted its noindex placeholder policy`,
    );
    return { isPlaceholder };
  }

  assert.ok(
    $("head title").text().trim().length > 0,
    `${relativePath} omitted its article title from the initial head`,
  );
  assert.ok(
    ($('head meta[name="description"]').attr("content") ?? "").trim().length >
      0 && Boolean($('head link[rel="canonical"]').attr("href")?.trim()),
    `${relativePath} omitted metadata from its initial head`,
  );
  return { isPlaceholder };
}
