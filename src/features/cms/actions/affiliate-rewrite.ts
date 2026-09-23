"use server";

import * as cheerio from "cheerio";

import { normalizeArticleHtml } from "@fwqgo/core/content";
import { requireAdminSession } from "@fwqgo/auth/session";
import { type AffiliateRewriteReport } from "@/server/links/affiliate-link-rewriter";
import { rewriteAffiliateLinks } from "@/server/links/affiliate-link-rewriter";
import { withAdminAudit } from "@/features/cms/lib/admin-audit";

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

async function rewriteDraftAffiliateLinksActionImpl(
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

export const rewriteDraftAffiliateLinksAction = withAdminAudit(
  {
    action: "post.affiliate_links.rewrite",
    entityType: "post",
  },
  rewriteDraftAffiliateLinksActionImpl,
);
