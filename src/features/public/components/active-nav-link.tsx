"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

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

/**
 * 下拉组「用完即收」的行为（2026-09-26）。
 *
 * ## 为什么必须显式收起
 *
 * 原生 `<details>` 的 `open` 是**持久状态**：点开之后只有再点一次 `<summary>`
 * 才会合上。这在页头里不成立 —— Header 挂在根 layout 上，客户端路由切换**不会**
 * 重建 DOM，所以点完二级菜单跳转过去，面板会跟着挂在新页面上；点页面别处同样不消失。
 * 实测复现的就是这两个现象。
 *
 * ## 五种收起时机
 *
 * 原生行为全部保留（JS 不可用时只是退回旧表现）：
 *
 * 1. 点面板里的链接 —— 触发跳转的那一次点击；
 * 2. 在整组之外按下指针（用 `pointerdown` 而不是 `click`：按住鼠标拖出面板也能收）；
 * 3. `Escape`；
 * 4. 焦点移出整组 —— 键盘 Tab 走到下一个导航项；
 * 5. 路由变化 —— 兜底，覆盖浏览器前进/后退这类不经过面板点击的跳转。
 *
 * ## 为什么指针移开也要收
 *
 * 悬停本身就会显示面板（`group-hover`）。用户顺手点一下 `<summary>` 会把 `open`
 * 变成 true，而 `group-open:visible` **盖过** hover 的收起逻辑 —— 鼠标移开后面板
 * 永久留在页面上，只能再点一次标题才能关掉。
 *
 * 只处理 `pointerType === "mouse"`：触摸设备上 `pointerleave` 在抬手后立刻触发，
 * 会把「点一下展开」变成「点了没反应」。
 *
 * ## 为什么 `pathname` 是参数而不是在这里 `usePathname()`
 *
 * 这个 hook 跑在 `NavGroupShell` 里，而它**同时是 `Suspense` 的 fallback**。
 * fallback 里读 URL 数据会让预渲染重新失去边界，所以只让 `ActiveNavGroupInner`
 * 读、再传进来；fallback 拿到 `undefined`，少最后一条兜底而已（它本来就是过渡态）。
 */
function useNavGroupDismiss(pathname?: string) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const close = useCallback(() => {
    const details = detailsRef.current;
    if (details?.open) details.open = false;
  }, []);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const details = detailsRef.current;
      if (!details?.open) return;
      const target = event.target;
      if (target instanceof Node && details.contains(target)) return;
      close();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close]);

  return { detailsRef, close };
}

/**
 * 不含路由判断的下拉组 —— 同时充当 fallback。`prefixes` 由类型带入但这里用不到。
 */
function NavGroupShell({
  title,
  summaryClassName,
  activeClassName,
  active,
  panelClassName,
  pathname,
  children,
}: ActiveNavGroupProps & { active: boolean; pathname?: string }) {
  const { detailsRef, close } = useNavGroupDismiss(pathname);

  return (
    <li>
      <details
        ref={detailsRef}
        className="group relative"
        // 点面板里的链接就收起。`<summary>` 上的点击**不能**拦 —— 那是原生的开合
        // 开关，拦掉之后键盘用户和无悬停场景就再也打不开了。
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a")) {
            close();
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") close();
        }}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
            close();
          }
        }}
      >
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
      pathname={pathname}
    />
  );
}

/**
 * 带下拉面板的导航组（`<details>`），在组内任一子项命中当前页时高亮标题。
 *
 * 面板内容由调用方作为 `children` 传入，仍然是服务端渲染的。
 * `panelClassName` 也是外部给的 —— 各组的宽度与栅格不同（见 `desktop-nav.tsx`）。
 *
 * **面板不能常驻**：点面板里的链接、点组外、按 `Escape`、焦点移出、路由变化
 * 都会收起（实现在 `useNavGroupDismiss`）。新增调用方不需要做任何事。
 */
export function ActiveNavGroup(props: ActiveNavGroupProps) {
  return (
    <Suspense fallback={<NavGroupShell {...props} active={false} />}>
      <ActiveNavGroupInner {...props} />
    </Suspense>
  );
}
