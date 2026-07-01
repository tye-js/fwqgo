"use server";

import * as cheerio from "cheerio";

import { normalizeArticleHtml } from "@fwqgo/core/content";
import { requireAdminSession } from "@fwqgo/auth/session";
import { type AffiliateRewriteReport } from "@fwqgo/scrape/affiliate-link-rewriter";
import { rewriteAffiliateLinks } from "@fwqgo/scrape/affiliate-link-rewriter";

const siteBaseUrl = "https://fwqgo.com";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "未知错误";
}

type RewriteDraftAffiliateLinksResult =
  | {
      data: {
        content: string;
        report: AffiliateRewriteReport;
      };
    }
  | { error: string; message: string };

export async function rewriteDraftAffiliateLinksAction(
  content: string,
): Promise<RewriteDraftAffiliateLinksResult> {
  try {
    await requireAdminSession();

    const $ = cheerio.load(content, null, false);
    const report = await rewriteAffiliateLinks({
      $,
      baseUrl: siteBaseUrl,
      sourceHost: new URL(siteBaseUrl).hostname,
      removeInternal: false,
    });

    return {
      data: {
        content: normalizeArticleHtml($.html()),
        report,
      },
    };
  } catch (error) {
    console.error("替换返利链接失败:", error);
    return { error: "替换返利链接失败", message: getErrorMessage(error) };
  }
}
