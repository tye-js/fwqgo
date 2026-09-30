"use client";

import Link from "@/features/public/components/public-link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";

import { cn } from "@fwqgo/core/utils";

import type { PublicNavLink } from "./public-nav";

const subscribeToHydration = () => () => undefined;
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

// 动态路由的 fallback 参数没有完整 pathname。首屏始终输出可用但不高亮的导航，
// 水合后再订阅真实 URL，避免 Next 预渲染中已中止的参数 Promise 再次被读取。
function useNavigationHydrated() {
  return useSyncExternalStore(
    subscribeToHydration,
    hydratedSnapshot,
    serverSnapshot,
  );
}

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
    <NavLinkShell {...props} active={isCurrentNavLink(props.link, pathname)} />
  );
}

export function ActiveNavLink(props: ActiveNavLinkProps) {
  const hydrated = useNavigationHydrated();
  return (
    <Suspense fallback={<NavLinkShell {...props} active={false} />}>
      {hydrated ? (
        <ActiveNavLinkInner {...props} />
      ) : (
        <NavLinkShell {...props} active={false} />
      )}
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
 * 导航组统一管理 open：悬停、点击和键盘看到的展开状态始终一致。
 * 链接点击、组外按下、Escape、焦点移出和路由变化立即收起；鼠标移出保留
 * 150ms 宽限，触摸抬手不收起。pathname 由 Suspense 内传入，fallback 不读 URL。
 */
function useNavGroupDismiss(pathname?: string) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByHover = useRef(false);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const close = useCallback(() => {
    cancelClose();
    openedByHover.current = false;
    const details = detailsRef.current;
    if (!details?.open) return;
    // 收起后不能把键盘焦点留在不可见的二级链接上。
    if (details.contains(document.activeElement)) {
      details.querySelector("summary")?.focus();
    }
    details.open = false;
  }, [cancelClose]);

  const open = useCallback(
    (fromHover = false) => {
      cancelClose();
      const details = detailsRef.current;
      if (details && !details.open) {
        openedByHover.current = fromHover;
        details.open = true;
      }
    },
    [cancelClose],
  );

  const onSummaryClick = useCallback((event: MouseEvent<HTMLElement>) => {
    // 点击前会先触发 pointerenter；首次点击确认悬停展开，避免立即反向收起。
    if (event.detail > 0 && openedByHover.current && detailsRef.current?.open) {
      event.preventDefault();
    }
    openedByHover.current = false;
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(close, 150);
  }, [cancelClose, close]);

  useEffect(() => cancelClose, [cancelClose]);

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

  return { detailsRef, close, open, scheduleClose, onSummaryClick };
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
  const { detailsRef, close, open, scheduleClose, onSummaryClick } =
    useNavGroupDismiss(pathname);

  return (
    <li>
      <details
        ref={detailsRef}
        name="public-desktop-navigation"
        className="group relative"
        // 链接点击后收起；summary 保留原生开合，只校正首次鼠标点击的悬停竞态。
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a")) {
            close();
          }
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") open(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") scheduleClose();
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
          onClick={onSummaryClick}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown") return;
            event.preventDefault();
            open();
            detailsRef.current?.querySelector("a")?.focus();
          }}
        >
          <span>{title}</span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 opacity-70 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          />
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
        props.prefixes.length > 0 && matchesPrefixes(props.prefixes, pathname)
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
  const hydrated = useNavigationHydrated();
  return (
    <Suspense fallback={<NavGroupShell {...props} active={false} />}>
      {hydrated ? (
        <ActiveNavGroupInner {...props} />
      ) : (
        <NavGroupShell {...props} active={false} />
      )}
    </Suspense>
  );
}
