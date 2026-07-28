import { getAffValueByHref } from "@/features/cms/actions/aff-provider";
import { resolveArticleAffiliateUrl } from "@fwqgo/core/affiliate-provider";

export async function handleAffUrl(href: string) {
  try {
    const newUrl = new URL(href);
    const { data: affServiceProvider } = await getAffValueByHref(
      newUrl.hostname,
    );
    if (affServiceProvider?.id) {
      const resolved = resolveArticleAffiliateUrl({
        rawUrl: newUrl.toString(),
        affiliate: affServiceProvider,
      });
      if (resolved) newUrl.href = resolved.url;
    }
    return newUrl.href;
  } catch (error) {
    console.error("Failed to handle aff url:", error);
    return href;
  }
}
