import Link from "next/link";

import { getCategories } from "@/features/shared/data/category";
import { BrandLogo } from "@/components/brand/brand-logo";

export default async function FooterComponent() {
  const fallbackQuickCategories = [
    { id: 0, name: "香港服务器", slug: "hk-vps" },
    { id: -1, name: "出海服务器", slug: "export-vps" },
    { id: -2, name: "高防服务器", slug: "ddos-vps" },
    { id: -3, name: "原生IP服务器", slug: "isp-vps" },
  ];

  let categories:
    | Array<{
        id: number;
        name: string;
        slug: string;
        children: Array<{ id: number; name: string; slug: string }>;
      }>
    | undefined;

  try {
    const result = await getCategories();
    categories = result.data;
  } catch {
    categories = undefined;
  }

  const quickCategories = (categories ?? [])
    .flatMap((category) =>
      category.children.length > 0 ? category.children : [category],
    )
    .slice(0, 8);

  const visibleQuickCategories =
    quickCategories.length > 0 ? quickCategories : fallbackQuickCategories;

  const footerData = [
    {
      title: "关于我们",
      content:
        "服务器go致力于为用户提供更高效的服务器筛选入口、优惠信息和选购思路，帮助用户更快找到适合自己的 VPS、云服务器与独立服务器。",
    },
    {
      title: "内容入口",
      links: [
        { title: "首页精选", href: "/" },
        { title: "服务器促销", href: "/fwq/tags/便宜vps推荐/page/1" },
        { title: "高防专区", href: "/fwq/ddos-vps/page/1" },
      ],
    },
    {
      title: "特色专区",
      links: [
        { title: "住宅IP专区", href: "/fwq/isp-vps/page/1" },
        { title: "出海专区", href: "/fwq/export-vps/page/1" },
        { title: "香港低延迟", href: "/fwq/hk-vps/page/1" },
      ],
    },
    {
      title: "联系我们",
      content: "邮箱: contact@fwqgo.com",
    },
  ];

  return (
    <footer className="border-t border-border/70 bg-zinc-100 text-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-border/70 bg-white/80 p-6 shadow-sm">
          <div className="grid gap-6 md:grid-cols-[220px_1fr]">
            <div>
              <BrandLogo compact className="items-start" textClassName="pt-0.5" />
              <p className="mt-4 text-sm font-medium text-foreground">快速进入</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                快速入口统一放到底部，继续往下浏览时也能直接切换方向。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleQuickCategories.map((category) => (
                <Link
                  key={category.id}
                  href={`/fwq/${category.slug}/page/1`}
                  prefetch
                  className="flex min-h-11 items-center rounded-md border border-border/70 bg-white px-4 py-3 text-sm text-zinc-600 transition-colors hover:border-accent/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {category.name}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-4">
          {footerData.map((item) => (
            <div key={item.title}>
              <h3 className="mb-4 text-sm font-semibold tracking-wide text-zinc-900">
                {item.title}
              </h3>
              {item.content ? (
                <p className="text-sm leading-7 text-zinc-600">{item.content}</p>
              ) : null}
              {item.links ? (
                <ul className="flex flex-col gap-3">
                  {item.links.map((link) => (
                    <li key={link.title}>
                      <Link
                        href={link.href}
                        prefetch
                        className="inline-flex min-h-8 items-center rounded-sm text-sm text-zinc-600 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {link.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-border/70 bg-white/70 px-4 py-5 text-sm text-zinc-500">
          <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
            <p>&copy; 2020-2026 服务器go 保留所有权利。</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
