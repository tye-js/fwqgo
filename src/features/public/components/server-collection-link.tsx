import Link from "@/features/public/components/public-link";
import type { ReactNode } from "react";

export type ServerCollectionKind = "providers" | "regions" | "lines";

export function collectionHref(kind: ServerCollectionKind, value: string) {
  return `/servers/${kind}/${encodeURIComponent(value)}`;
}

/**
 * 目录单元格（商家 / 地区 / 线路）：**只有归一到字典才渲染链接**。
 *
 * ## 为什么必须判断 slug
 *
 * `/servers/<kind>/<slug>` 只在 slug 命中字典（`aff_service_providers` /
 * `server_regions` / `server_network_lines`）时才有页面。而套餐上的
 * `providerName` / `region` / `lineType` 是**抓取原文**，未归一的行大量存在
 * （线路「普通 BGP」「CMIN2+CUII」、字典里没有的供应商「dedione」「nosla」）。
 * 把展示原文当 slug 拼链接，点进去就是 404 —— 实测爬站一次抓到 4 个。
 *
 * ## 为什么是共享组件
 *
 * 这条规则原先在 `server-inventory-results.tsx` 与 `server-offer-table.tsx` 里
 * **各写了一份**，结果是只修了一处、另一处继续产生死链（前者早就改成回落纯文本，
 * 后者还在拼前缀）。所以规则收在这里，两处都引它。
 *
 * 未归一的行渲染成**纯文本**：信息保留，但不产生死链。这与站点对「未达阈值的分类法链接」
 * 的处理一致。
 *
 * `prefetch` 默认关闭：目录链接在列表里会重复几十上百次，逐个预取会显著增加 RSC 流量。
 */
export function ServerCollectionLink({
  kind,
  slug,
  className,
  prefetch = false,
  children,
}: {
  kind: ServerCollectionKind;
  /** 字典 slug。为空（未归一）时渲染纯文本。 */
  slug: string | null | undefined;
  className?: string;
  prefetch?: boolean;
  children: ReactNode;
}) {
  const canonical = slug?.trim();
  if (!canonical) return <span className={className}>{children}</span>;
  return (
    <Link
      href={collectionHref(kind, canonical)}
      prefetch={prefetch}
      className={className}
    >
      {children}
    </Link>
  );
}
