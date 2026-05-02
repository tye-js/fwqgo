import { getAffValueByHref } from "@/app/_actions/aff-provider";

export async function handleAffUrl(href: string) {
  try {
    // TODO 此处要处理不同云服务商对应的返利链接
    const newUrl = new URL(href);
    console.log(newUrl);
    // 传入hostname比对officialUrl 来获取对应affParam和affId
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
