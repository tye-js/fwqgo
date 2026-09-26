import Link from "next/link";

import { cn } from "@fwqgo/core/utils";
import { Search } from "lucide-react";

import { ActiveNavGroup, ActiveNavLink } from "./active-nav-link";
import type { HeaderCopy } from "./header-copy";
import type { PublicNavLink, PublicNavModel } from "./public-nav";

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
 * 换来：无 JS 时也能展开（`<summary>` 是原生按钮，键盘 Enter/Space 可切换，
 * 屏幕阅读器会播报展开状态）。丢掉：Radix 的箭头键导航与展开动画。
 *
 * ## 悬停手感：为什么不是 `hidden` / `block`
 *
 * 面板的显示/隐藏走 `visibility` + `opacity` 过渡，并且**收起方向带 150ms 延迟**
 * （`delay-150`，展开方向是 `delay-0`）。这样鼠标从标题移向面板的途中不会立刻消失 ——
 * 2026-09-25 之前用 `hidden` / `group-hover:block` 切换，`display` 不可过渡，手一抖面板就没了。
 *
 * ## 2026-09-26 的视觉重做
 *
 * 四个问题与对应处理：
 *
 * 1. **hover 是整块变实心主色** → 改为浅底（`hover:bg-muted`）+ 文字加深。原先把一排链接
 *    都做成"看起来像按钮"的实心反馈，鼠标扫过时整条导航都在闪；
 * 2. **没有当前页指示** → 加 `ActiveNavLink` / `ActiveNavGroup`（主色文字 + 贴底下划线 +
 *    `aria-current="page"`），判定规则来自数据层的 `matchPrefixes`；
 * 3. **搜索是纯文字、与相邻项无差别** → 加放大镜图标；
 * 4. **「服务器比价」是核心转化入口却与其它项同权** → 移到最右、做成主按钮外观。
 *    ⚠️ 它**仍然是 `<details>`**：改成纯按钮会丢掉面板里「全部套餐 / 香港 / 美国 / 便宜 VPS」
 *    四个入口，所以只把 `<summary>` 画成主按钮，展开行为不变。
 *
 * 高亮要读路由，所以只有那两种元素下沉到客户端（`active-nav-link.tsx`），
 * 本文件与面板内容仍是服务端渲染。
 *
 * ## 2026-09-26：面板不再常驻
 *
 * 原生 `<details>` 的 `open` 是持久状态，而 Header 挂在根 layout 上、客户端路由
 * 切换不重建 DOM —— 点完二级菜单跳转过去，面板会跟着挂在新页面上，点页面别处也不消失。
 * 收起逻辑统一收在 `active-nav-link.tsx` 的 `useNavGroupDismiss` 里，
 * 这里只负责版面，不需要（也不应该）各自加一套。
 */

/** 普通导航项：默认略淡，hover 给一层浅底 —— 不再整块实心。 */
const navLinkClass =
  "inline-flex min-h-11 w-max items-center gap-1.5 rounded-md px-3.5 py-2 text-base font-medium text-foreground/75 transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * 当前页：主色文字 + 一条贴底的下划线。
 *
 * 用 `after` 伪元素而不是 `border-b-2` —— 后者会把元素撑高 2px，一行里的项就不齐了。
 */
const activeNavLinkClass =
  "relative text-primary hover:text-primary after:absolute after:inset-x-3.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary";

/** 普通下拉的 `<summary>`：外观同导航项，另加原生 details 的复位。 */
const summaryClass = cn(
  navLinkClass,
  "cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden",
);

/** 「服务器比价」的 `<summary>`：主按钮外观。 */
const primaryActionClass =
  "inline-flex min-h-11 w-max cursor-pointer select-none list-none items-center rounded-full bg-primary px-5 py-2 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden";

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

/**
 * 下拉面板容器（不含对齐方向）。
 *
 * - 收起态 `invisible opacity-0` + `delay-150`：移开鼠标后有 150ms 宽限期；
 * - 悬停或 `<details open>` 时 `delay-0`，立即出现；
 * - `pt-2` 既是标题与面板之间的视觉间距，也保证两者之间没有可穿透的空隙。
 *
 * **对齐方向必须写成完整字面量**（下面各一份），不能用
 * `panelBaseClass.replace("left-0", "right-0")` 去拼 —— Tailwind 在源码里做子串匹配，
 * 拼出来的类名扫不到，样式会**静默失效**。
 */
const panelBaseClass =
  "invisible absolute top-full z-50 pt-2 opacity-0 transition-[opacity,visibility] duration-150 delay-150 group-hover:visible group-hover:opacity-100 group-hover:delay-0 group-open:visible group-open:opacity-100 group-open:delay-0";

/** 内容入口组的面板：左对齐。 */
const panelClass = cn(panelBaseClass, "left-0");

/** 最右的主入口组：右对齐，避免面板溢出容器右边缘。 */
const primaryPanelClass = cn(panelBaseClass, "right-0");

const panelListClass =
  "grid gap-2 rounded-md border border-border/70 bg-popover p-4 shadow-lg";

const listItemClass =
  "block select-none space-y-2 rounded-md border border-transparent p-3.5 leading-none no-underline outline-none transition-colors hover:border-border hover:bg-muted/60 focus:border-border focus:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring";

function ListItem({ link }: { link: PublicNavLink }) {
  return (
    <li>
      <Link href={link.href} prefetch={false} className={listItemClass}>
        <div className="text-sm font-medium leading-none">{link.label}</div>
        {link.description ? (
          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
            {link.description}
          </p>
        ) : null}
      </Link>
    </li>
  );
}

/** 组内所有子项的高亮前缀合并结果 —— 任一中命中就让组标题高亮。 */
function groupPrefixes(links: PublicNavLink[]) {
  return links.flatMap((link) => link.matchPrefixes ?? []);
}

function NavGroupPanel({
  links,
  panelClassName,
}: {
  links: PublicNavLink[];
  panelClassName: string;
}) {
  return (
    <ul className={cn(panelListClass, panelClassName)}>
      {links.map((link) => (
        <ListItem key={link.href} link={link} />
      ))}
    </ul>
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
              links={nav.categories}
              panelClassName="max-h-[calc(100dvh-5rem)] w-[min(860px,calc(100vw-2rem))] overflow-y-auto md:grid-cols-2 xl:grid-cols-3"
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
            links={nav.tools}
            panelClassName="w-[min(520px,calc(100vw-2rem))] md:grid-cols-2"
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
            links={nav.deals}
            panelClassName="w-[420px] gap-3 md:w-[520px] md:grid-cols-2"
          />
        </ActiveNavGroup>
      </ul>
    </nav>
  );
}
