import Link from "@/features/public/components/public-link";

import { cn } from "@fwqgo/core/utils";
import { ArrowUpRight, Search } from "lucide-react";

import { ActiveNavGroup, ActiveNavLink } from "./active-nav-link";
import type { HeaderCopy } from "./header-copy";
import type { PublicNavLink, PublicNavModel } from "./public-nav";

/**
 * 桌面导航保持服务端渲染，原生 details 在无 JS 时也可点击展开。
 * 路由高亮、悬停和收起行为统一由 ActiveNavGroup 管理；面板只跟随 open，
 * 避免 CSS hover 在 Escape 或点击链接后把已收起的面板重新显示出来。
 */

/** 普通导航项：默认略淡，hover 给一层浅底 —— 不再整块实心。 */
const navLinkClass =
  "inline-flex min-h-11 w-max items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * 当前页：主色文字 + 一条贴底的下划线。
 *
 * 用 `after` 伪元素而不是 `border-b-2` —— 后者会把元素撑高 2px，一行里的项就不齐了。
 */
const activeNavLinkClass =
  "relative text-primary hover:text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary";

/** 普通下拉的 `<summary>`：外观同导航项，另加原生 details 的复位。 */
const summaryClass = cn(
  navLinkClass,
  "cursor-pointer select-none list-none group-open:bg-muted group-open:text-foreground [&::-webkit-details-marker]:hidden",
);

/** 「服务器比价」的 `<summary>`：主按钮外观。 */
const primaryActionClass =
  "inline-flex min-h-11 w-max cursor-pointer select-none list-none items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 group-open:bg-primary/90 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden";

/**
 * 「服务器比价」命中当前页时的表现。
 *
 * 它是**实心**按钮，所以不能像普通项那样用下划线 —— 同色系的浅下划线在实心底上看不出来。
 * 也不该做成"按下态"（`bg-primary/85` 之类）：静态页面上显示"按下"语义是错的，那是交互反馈。
 * 用**选中态**表达：留 2px 间隙加一圈同色系淡光晕。
 *
 * `ring` 是 box-shadow，**不占布局**，所以导航行高不会因为高亮而变化。
 */
const primaryActionActiveClass =
  "ring-2 ring-primary/40 ring-offset-2 ring-offset-background";

/** pt-3 保留标题到面板的指针通道；收起宽限时间在客户端统一处理。 */
const panelBaseClass = "absolute top-full z-50 pt-3";

/** 内容入口组的面板：左对齐。 */
const panelClass = cn(panelBaseClass, "left-0");

/** 最右的主入口组：右对齐，避免面板溢出容器右边缘。 */
const primaryPanelClass = cn(panelBaseClass, "right-0");

const panelListClass =
  "overflow-y-auto overscroll-contain rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-xl shadow-black/10";

const listItemClass =
  "group/item flex min-h-11 items-start gap-3 rounded-xl p-3 no-underline outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";

function ListItem({ link }: { link: PublicNavLink }) {
  return (
    <li className="min-w-0">
      <Link href={link.href} prefetch={false} className={listItemClass}>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-sm font-semibold leading-5 [overflow-wrap:anywhere] group-hover/item:text-primary">
            {link.label}
          </div>
          {link.description ? (
            <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
              {link.description}
            </p>
          ) : null}
        </div>
        <ArrowUpRight
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover/item:text-primary"
        />
      </Link>
    </li>
  );
}

/** 组内所有子项的高亮前缀合并结果 —— 任一中命中就让组标题高亮。 */
function groupPrefixes(links: PublicNavLink[]) {
  return links.flatMap((link) => link.matchPrefixes ?? []);
}

function NavGroupPanel({
  title,
  description,
  links,
  panelClassName,
  listClassName,
}: {
  title: string;
  description: string;
  links: PublicNavLink[];
  panelClassName: string;
  listClassName?: string;
}) {
  return (
    <div
      className={cn(
        panelListClass,
        "max-h-[calc(100dvh-7rem)]",
        panelClassName,
      )}
    >
      <div className="border-b border-border/60 bg-muted/40 px-5 py-4">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <ul className={cn("grid gap-1 p-2", listClassName)}>
        {links.map((link) => (
          <ListItem key={link.href} link={link} />
        ))}
      </ul>
    </div>
  );
}

export function DesktopNav({
  copy,
  nav,
  categoriesFailed,
}: {
  copy: HeaderCopy;
  nav: PublicNavModel;
  categoriesFailed: boolean;
}) {
  return (
    <nav className="hidden xl:block" aria-label={copy.navigationTitle}>
      <ul className="flex items-center gap-1">
        {/* 内容入口：左对齐成组 */}
        <li>
          <ActiveNavLink
            link={nav.latest}
            className={navLinkClass}
            activeClassName={activeNavLinkClass}
          />
        </li>

        {nav.categories.length > 0 ? (
          <ActiveNavGroup
            title={copy.articleCategories}
            prefixes={groupPrefixes(nav.categories)}
            summaryClassName={summaryClass}
            activeClassName={activeNavLinkClass}
            panelClassName={panelClass}
          >
            <NavGroupPanel
              title={copy.articleCategories}
              description={copy.articleCategoriesDescription}
              links={nav.categories}
              panelClassName="w-[min(680px,calc(100vw-2rem))]"
              listClassName="grid-cols-3"
            />
          </ActiveNavGroup>
        ) : null}

        {categoriesFailed ? (
          <li>
            <Link
              // 与「服务器比价」第一项同址：分类挂了时给一条仍然可达的比价入口。
              href={nav.deals[0]?.href ?? "/servers"}
              prefetch
              className={cn(navLinkClass, "text-muted-foreground")}
            >
              {copy.errorLabel}
            </Link>
          </li>
        ) : null}

        {nav.knowledge ? (
          <li>
            <ActiveNavLink
              link={nav.knowledge}
              className={navLinkClass}
              activeClassName={activeNavLinkClass}
              prefetch
            />
          </li>
        ) : null}

        <ActiveNavGroup
          title={copy.toolsTitle}
          prefixes={groupPrefixes(nav.tools)}
          summaryClassName={summaryClass}
          activeClassName={activeNavLinkClass}
          panelClassName={panelClass}
        >
          <NavGroupPanel
            title={copy.toolsTitle}
            description={copy.toolsDescription}
            links={nav.tools}
            panelClassName="w-[min(420px,calc(100vw-2rem))]"
          />
        </ActiveNavGroup>

        <li>
          <ActiveNavLink
            link={nav.search}
            className={navLinkClass}
            activeClassName={activeNavLinkClass}
            prefetch
          >
            <Search className="size-4" aria-hidden="true" />
            {nav.search.label}
          </ActiveNavLink>
        </li>

        {/* 核心转化入口放最右，主按钮外观；仍是 <details>，四个子项不丢 */}
        <ActiveNavGroup
          title={copy.dealsTitle}
          prefixes={groupPrefixes(nav.deals)}
          summaryClassName={primaryActionClass}
          activeClassName={primaryActionActiveClass}
          panelClassName={primaryPanelClass}
        >
          <NavGroupPanel
            title={copy.dealsTitle}
            description={copy.dealsDescription}
            links={nav.deals}
            panelClassName="w-[min(520px,calc(100vw-2rem))]"
            listClassName="grid-cols-2"
          />
        </ActiveNavGroup>
      </ul>
    </nav>
  );
}
