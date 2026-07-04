import Link from "next/link";

import { BrandLogo } from "@/components/brand/brand-logo";
import { getCategories } from "@/features/shared/data/category";

type PublicLanguage = "zh" | "en";

const fallbackQuickCategories: Record<
  PublicLanguage,
  Array<{ id: number; name: string; slug: string }>
> = {
  zh: [
    { id: 0, name: "香港服务器", slug: "hk-vps" },
    { id: -1, name: "出海服务器", slug: "export-vps" },
    { id: -2, name: "高防服务器", slug: "ddos-vps" },
    { id: -3, name: "原生IP服务器", slug: "isp-vps" },
  ],
  en: [
    { id: 0, name: "Hong Kong VPS", slug: "hk-vps" },
    { id: -1, name: "Offshore servers", slug: "export-vps" },
    { id: -2, name: "DDoS protected servers", slug: "ddos-vps" },
    { id: -3, name: "Native IP servers", slug: "isp-vps" },
  ],
};

const footerCopy = {
  zh: {
    quickTitle: "快速进入",
    quickDescription: "快速入口统一放到底部，继续往下浏览时也能直接切换方向。",
    copyright: "服务器go 保留所有权利。",
    columns: [
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
    ],
  },
  en: {
    quickTitle: "Quick links",
    quickDescription:
      "Jump to the most useful server topics and continue browsing in English.",
    copyright: "fwqgo. All rights reserved.",
    columns: [
      {
        title: "About",
        content:
          "fwqgo helps readers compare VPS deals, hosting promotions, and practical buying guides for cloud servers and dedicated servers.",
      },
      {
        title: "Content",
        links: [
          { title: "English homepage", href: "/en" },
          { title: "Chinese homepage", href: "/" },
          { title: "All server offers", href: "/servers" },
        ],
      },
      {
        title: "Featured Topics",
        links: [
          { title: "Residential IP servers", href: "/en/fwq/isp-vps/page/1" },
          { title: "Offshore servers", href: "/en/fwq/export-vps/page/1" },
          { title: "Hong Kong low latency", href: "/en/fwq/hk-vps/page/1" },
        ],
      },
      {
        title: "Contact",
        content: "Email: contact@fwqgo.com",
      },
    ],
  },
} satisfies Record<
  PublicLanguage,
  {
    quickTitle: string;
    quickDescription: string;
    copyright: string;
    columns: Array<{
      title: string;
      content?: string;
      links?: Array<{ title: string; href: string }>;
    }>;
  }
>;

function categoryHref(slug: string, language: PublicLanguage) {
  return `${language === "en" ? "/en" : ""}/fwq/${slug}/page/1`;
}

function nonEmptyTrim(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

export default async function FooterComponent({
  language = "zh",
}: {
  language?: PublicLanguage;
}) {
  let categories:
    | Array<{
        id: number;
        name: string;
        slug: string;
        enName?: string | null;
        enSlug?: string | null;
        children: Array<{
          id: number;
          name: string;
          slug: string;
          enName?: string | null;
          enSlug?: string | null;
        }>;
      }>
    | undefined;

  try {
    const result = await getCategories();
    categories = result.data;
  } catch {
    categories = undefined;
  }

  const safeCategories = (categories ?? []).map((category) => {
    if (language === "zh") {
      return category;
    }

    return {
      ...category,
      name: nonEmptyTrim(category.enName) ?? category.name,
      slug: nonEmptyTrim(category.enSlug) ?? category.slug,
      children: category.children.map((child) => ({
        ...child,
        name: nonEmptyTrim(child.enName) ?? child.name,
        slug: nonEmptyTrim(child.enSlug) ?? child.slug,
      })),
    };
  });

  const quickCategories = safeCategories
    .flatMap((category) =>
      category.children.length > 0 ? category.children : [category],
    )
    .slice(0, 8);

  const visibleQuickCategories =
    quickCategories.length > 0
      ? quickCategories
      : fallbackQuickCategories[language];
  const copy = footerCopy[language];

  return (
    <footer className="border-t border-border/70 bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-border/70 bg-muted/20 p-5 shadow-sm">
          <div className="grid gap-6 md:grid-cols-[220px_1fr]">
            <div>
              <BrandLogo
                compact
                className="items-start"
                textClassName="pt-0.5"
              />
              <p className="mt-4 text-sm font-medium text-foreground">
                {copy.quickTitle}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {copy.quickDescription}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleQuickCategories.map((category) => (
                <Link
                  key={category.id}
                  href={categoryHref(category.slug, language)}
                  prefetch
                  className="flex min-h-11 items-center rounded-md border border-border/70 bg-background px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-accent/30 hover:bg-accent/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {category.name}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-4">
          {copy.columns.map((item) => (
            <div key={item.title}>
              <h3 className="mb-4 text-sm font-semibold tracking-wide text-foreground">
                {item.title}
              </h3>
              {item.content ? (
                <p className="text-sm leading-7 text-muted-foreground">
                  {item.content}
                </p>
              ) : null}
              {item.links ? (
                <ul className="flex flex-col gap-2">
                  {item.links.map((link) => (
                    <li key={link.title}>
                      <Link
                        href={link.href}
                        prefetch
                        className="inline-flex min-h-10 items-center rounded-sm py-1 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

        <div className="mt-8 rounded-lg border border-border/70 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
          <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
            <p>&copy; 2020-2026 {copy.copyright}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
