"use client";

import dynamic from "next/dynamic";

/**
 * 前台的消息提示容器。
 *
 * 全站只在这里定义提示样式，两个根布局各挂一次。前台有两处会推消息 ——
 * 文章页的「复制链接」（`article-share-actions`）和 /servers 的「复制优惠码」
 * （`server-inventory-offer-actions`）—— 它们都只往 sonner 的 store 里塞一条记录，
 * 没有订阅这个 store 的容器渲染，点了就什么反馈都没有。
 *
 * sonner 按需加载：调用方本身静态导入了 `toast`，所以那两个页面上它早就在包里，
 * 这里的动态 chunk 只会复用同一个模块实例；而首页、知识库、工具页这类不会出现
 * 提示的页面，它在 hydration 之后才被拉取，不进首屏关键路径。
 */
const Toaster = dynamic(() => import("sonner").then((mod) => mod.Toaster), {
  ssr: false,
});

/** 页头是 `sticky top-0` 的 5rem 导航条，提示要落在它下面而不是盖住导航。 */
const headerOffset = {
  top: "calc(5.25rem + env(safe-area-inset-top))",
};

export function PublicToaster() {
  return (
    <Toaster
      position="top-center"
      expand={false}
      closeButton
      duration={5000}
      visibleToasts={3}
      offset={headerOffset}
      mobileOffset={{
        ...headerOffset,
        left: "0.75rem",
        right: "0.75rem",
      }}
      richColors
      toastOptions={{
        style: {
          background: "hsl(var(--background))",
          color: "hsl(var(--foreground))",
          border: "1px solid hsl(var(--border))",
        },
      }}
    />
  );
}
