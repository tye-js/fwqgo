"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { cn } from "@fwqgo/core/utils";

import type { PublicNavLink } from "./public-nav";

/**
 * 带「当前页」高亮的导航元素。
 *
 * ## 为什么必须包 `<Suspense>`
 *
 * 本项目启用了 `cacheComponents: true`。在这个模式下，客户端组件里用 `usePathname()`
 * 读 URL **会阻断预渲染**，构建时直接失败：
 *
 * ```
 * Next.js encountered URL data `usePathname()` in a Client Component outside of <Suspense>.
 * This blocks prerendering because the value is only available at runtime.
 * ```
 *
 * （`header.tsx` 里包语言切换的那个 `React.Suspense` 就是同一个原因。）
 *
 * 所以边界**收在这里**：调用方直接写 `<ActiveNavLink …/>` 就行，不用自己记得包 Suspense。
 * 代价是 SSR 时先出 fallback（无高亮版）再流式替换 —— fallback 里带着 `children`，
 * 所以面板内容不会闪空。
 *
 * ## 为什么要有这个客户端文件
 *
 * 高亮需要知道当前路由，而 `usePathname()` 只能在客户端组件里用。桌面导航整体是
 * 服务端组件（那里刻意保持零客户端依赖，见 `desktop-nav.tsx` 顶部的说明），
 * 所以只把**这一层**下沉到客户端：服务端组件渲染客户端子组件是完全正常的，
 * 不会把父组件的依赖拖进客户端包。
 *
 * 直链与下拉组放在同一个文件里，是为了只引入**一个** `"use client"` 边界。
 *
 * ## 匹配规则不在这里
 *
 * 判定用的是数据层给的 `matchPrefixes`（见 `public-nav.ts`）—— 语言前缀已经包含在
 * 那些前缀里，所以中英文两套路径走的是同一套规则，这里不需要再处理 `/en`。
 */

function matchesPrefixes(prefixes: readonly string[], pathname: string) {
  return prefixes.some(
    (prefix) =>
      pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix),
  );
}

/** 当前路径是否命中这一项的高亮前缀。留空 `matchPrefixes` 的项永不命中。 */
export function isCurrentNavLink(link: PublicNavLink, pathname: string) {
  const prefixes = link.matchPrefixes;
  if (!prefixes?.length) return false;
  return matchesPrefixes(prefixes, pathname);
}

/**
 * 不含路由判断的导航链接 —— 同时充当 `Suspense` 的 fallback（`active={false}`）。
 */
function NavLinkShell({
  link,
  className,
  activeClassName,
  active,
  children,
  prefetch,
  onNavigate,
}: {
  link: PublicNavLink;
  className: string;
  activeClassName: string;
  active: boolean;
  children?: ReactNode;
  prefetch?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={link.href}
      prefetch={prefetch}
      onClick={onNavigate}
      // 让读屏用户也知道这是当前页；视觉下划线由 activeClassName 提供。
      aria-current={active ? "page" : undefined}
      className={cn(className, active && activeClassName)}
    >
      {children ?? link.label}
    </Link>
  );
}

type ActiveNavLinkProps = {
  link: PublicNavLink;
  className: string;
  /** 命中当前页时追加的类（主色文字 + 下划线）。 */
  activeClassName: string;
  children?: ReactNode;
  prefetch?: boolean;
  onNavigate?: () => void;
};

function ActiveNavLinkInner(props: ActiveNavLinkProps) {
  const pathname = usePathname();
  return (
    <NavLinkShell
      {...props}
      active={isCurrentNavLink(props.link, pathname)}
    />
  );
}

export function ActiveNavLink(props: ActiveNavLinkProps) {
  return (
    <Suspense fallback={<NavLinkShell {...props} active={false} />}>
      <ActiveNavLinkInner {...props} />
    </Suspense>
  );
}

type ActiveNavGroupProps = {
  title: string;
  /** 组内所有子项的 `matchPrefixes` 合并结果。 */
  prefixes: readonly string[];
  summaryClassName: string;
  activeClassName: string;
  panelClassName: string;
  children: ReactNode;
};

/** 不含路由判断的下拉组 —— 同时充当 fallback。`prefixes` 由类型带入但这里用不到。 */
function NavGroupShell({
  title,
  summaryClassName,
  activeClassName,
  active,
  panelClassName,
  children,
}: ActiveNavGroupProps & { active: boolean }) {
  return (
    <li>
      <details className="group relative">
        <summary
          aria-current={active ? "page" : undefined}
          className={cn(summaryClassName, active && activeClassName)}
        >
          {title}
        </summary>
        <div className={panelClassName}>{children}</div>
      </details>
    </li>
  );
}

function ActiveNavGroupInner(props: ActiveNavGroupProps) {
  const pathname = usePathname();
  return (
    <NavGroupShell
      {...props}
      active={
        props.prefixes.length > 0 &&
        matchesPrefixes(props.prefixes, pathname)
      }
    />
  );
}

/**
 * 带下拉面板的导航组（`<details>`），在组内任一子项命中当前页时高亮标题。
 *
 * 面板内容由调用方作为 `children` 传入，仍然是服务端渲染的。
 * `panelClassName` 也是外部给的 —— 各组的宽度与栅格不同（见 `desktop-nav.tsx`）。
 */
export function ActiveNavGroup(props: ActiveNavGroupProps) {
  return (
    <Suspense fallback={<NavGroupShell {...props} active={false} />}>
      <ActiveNavGroupInner {...props} />
    </Suspense>
  );
}
