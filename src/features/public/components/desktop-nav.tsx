import Link from "next/link";

import { cn } from "@fwqgo/core/utils";

import type { HeaderCopy, PublicLanguage } from "./header-copy";

/**
 * 桌面主导航（`xl` 及以上）。
 *
 * ## 为什么不用 Radix NavigationMenu
 *
 * 原来这里用 `@/components/ui/navigation-menu`（Radix）。那个 chunk 是 **73.9 KB 源码 /
 * 23.4 KB 传输**，而且**每个页面**都会加载 —— 但这段导航只在 `xl` 以上可见，
 * 手机上用户看到的是另一个抽屉。`navigation-menu` 全仓只有这一处用，
 * 换成原生 `<details>` 之后这个依赖可以整个省掉。
 *
 * ## 换来什么、丢掉什么
 *
 * 换来：**零客户端 JS**、无 JS 时也能展开（`<summary>` 是原生按钮，键盘 Enter/Space 可切换，
 * 屏幕阅读器会播报展开状态）、不需要 hydration。
 *
 * 丢掉：Radix 的「箭头键在菜单项之间移动」、展开动画、打开延迟。
 * 保留了**悬停**与**点击**两种打开方式，与原来的手感一致：
 * - `group-hover:block` —— 鼠标移上去就展开，移开就收（对应 Radix 的 hover 打开）；
 * - `group-open:block` —— 点一下 `<summary>` 钉住，再点收起（对应 Radix 的 click 打开）。
 *
 * 面板用 `absolute` 定位在 `<summary>` 正下方。header 有 `z-50`，面板是它的后代，
 * 因此不会压在页面内容下面。
 */

const navLinkClass =
  "inline-flex min-h-11 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-base font-medium text-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:bg-primary focus-visible:text-primary-foreground focus-visible:outline-none";

/** 面板容器：默认隐藏，悬停或 `<details open>` 时显示。 */
const panelClass =
  "absolute left-0 top-full z-50 hidden pt-2 group-hover:block group-open:block";

const panelListClass =
  "grid gap-2 rounded-md border border-border/70 bg-popover p-4 shadow-lg";

function ListItem({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        prefetch={false}
        className="block select-none space-y-2 rounded-md border border-transparent p-3.5 leading-none no-underline outline-none transition-colors hover:border-border hover:bg-muted/60 focus:border-border focus:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="text-sm font-medium leading-none">{title}</div>
        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
          {children}
        </p>
      </Link>
    </li>
  );
}

export function DesktopNav({
  language,
  copy,
  categories,
  categoriesFailed,
}: {
  language: PublicLanguage;
  copy: HeaderCopy;
  categories: Array<{
    id: number;
    name: string;
    slug: string;
    description: string | null;
  }>;
  categoriesFailed: boolean;
}) {
  const articlePrefix = language === "en" ? "/en" : "";

  return (
    <nav className="hidden xl:block" aria-label={copy.navigationTitle}>
      <ul className="flex items-center gap-0.5">
        <li>
          <Link href={`${articlePrefix}/fwq/page/1`} className={navLinkClass}>
            {language === "en" ? "Journal" : "最新文章"}
          </Link>
        </li>

        <li>
          <details className="group relative">
            <summary
              className={cn(
                navLinkClass,
                "cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden",
              )}
            >
              {copy.dealsTitle}
            </summary>
            <div className={panelClass}>
              <ul
                className={cn(
                  panelListClass,
                  "w-[420px] gap-3 md:w-[520px] md:grid-cols-2",
                )}
              >
                <ListItem title={copy.allOffers} href="/servers">
                  {copy.allOffersDescription}
                </ListItem>
                <ListItem title={copy.hongKong} href="/servers/hong-kong">
                  {copy.hongKongDescription}
                </ListItem>
                <ListItem
                  title={copy.unitedStates}
                  href="/servers/united-states"
                >
                  {copy.unitedStatesDescription}
                </ListItem>
                <ListItem title={copy.cheapVps} href="/servers/cheap-vps">
                  {copy.cheapVpsDescription}
                </ListItem>
              </ul>
            </div>
          </details>
        </li>

        {categories.length > 0 ? (
          <li>
            <details className="group relative">
              <summary
                className={cn(
                  navLinkClass,
                  "cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden",
                )}
              >
                {copy.articleCategories}
              </summary>
              <div className={panelClass}>
                <ul
                  className={cn(
                    panelListClass,
                    "max-h-[calc(100dvh-5rem)] w-[min(860px,calc(100vw-2rem))] overflow-y-auto md:grid-cols-2 xl:grid-cols-3",
                  )}
                >
                  {categories.map((category) => (
                    <ListItem
                      key={category.id}
                      title={category.name}
                      href={`${articlePrefix}/fwq/${encodeURIComponent(category.slug)}/page/1`}
                    >
                      {category.description}
                    </ListItem>
                  ))}
                </ul>
              </div>
            </details>
          </li>
        ) : null}

        {categoriesFailed ? (
          <li>
            <Link
              href="/servers"
              prefetch
              className={cn(navLinkClass, "text-muted-foreground")}
            >
              {copy.errorLabel}
            </Link>
          </li>
        ) : null}

        {copy.knowledgeHref && copy.knowledgeLabel ? (
          <li>
            <Link
              href={copy.knowledgeHref}
              prefetch
              className={navLinkClass}
            >
              {copy.knowledgeLabel}
            </Link>
          </li>
        ) : null}

        <li>
          <details className="group relative">
            <summary
              className={cn(
                navLinkClass,
                "cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden",
              )}
            >
              {language === "en" ? "Tools" : "选购工具"}
            </summary>
            <div className={panelClass}>
              <ul
                className={cn(
                  panelListClass,
                  "w-[min(520px,calc(100vw-2rem))] md:grid-cols-2",
                )}
              >
                <ListItem
                  href={`${articlePrefix}/tools/server-sizing`}
                  title={language === "en" ? "Server sizing" : "服务器配置选择"}
                >
                  {language === "en"
                    ? "Match CPU, memory and storage to your workload."
                    : "结合业务规模，梳理 CPU、内存和存储需求。"}
                </ListItem>
                <ListItem
                  href={`${articlePrefix}/tools/network-lines`}
                  title={language === "en" ? "Network routes" : "网络线路选择"}
                >
                  {language === "en"
                    ? "Understand routes and carrier compatibility."
                    : "根据用户地区和运营商，比较网络线路。"}
                </ListItem>
              </ul>
            </div>
          </details>
        </li>

        <li>
          <Link href={copy.searchHref} prefetch className={navLinkClass}>
            {copy.searchLabel}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
