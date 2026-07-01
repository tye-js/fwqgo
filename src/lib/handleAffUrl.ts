import { getAffValueByHref } from "@/features/cms/actions/aff-provider";

export async function handleAffUrl(href: string) {
  try {
    const newUrl = new URL(href);
    const { data: affServiceProvider } = await getAffValueByHref(
      newUrl.hostname,
    );
    if (affServiceProvider?.id) {
      if (affServiceProvider.affParam != "href") {
        newUrl.searchParams.set(
          affServiceProvider.affParam,
          affServiceProvider.affValue,
        );
      } else {
        // 替换为新的链接
        newUrl.href = affServiceProvider.affUrl;
      }
    }
    return newUrl.href;
  } catch (error) {
    console.error("Failed to handle aff url:", error);
    return href;
  }
}
