import Link from "next/link";
import { Suspense } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BookOpen,
  Globe2,
  Mail,
  Server,
  ShieldCheck,
  Tags,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { LanguageSwitchLink } from "@/features/public/components/language-switch-link";
import { getCategories } from "@/features/shared/data/category";

type PublicLanguage = "zh" | "en";

type FooterCategory = {
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
};

type FooterLink = {
  title: string;
  href: string;
  description?: string;
};

type FooterGroup = {
  id: string;
  title: string;
  icon: LucideIcon;
  links: FooterLink[];
};

const fallbackQuickCategories: Record<
  PublicLanguage,
  Array<{ id: number; name: string; slug: string }>
> = {
  zh: [
    { id: 0, name: "香港服务器", slug: "hk-vps" },
    { id: -1, name: "出海服务器", slug: "export-vps" },
    { id: -2, name: "高防服务器", slug: "ddos-vps" },
    { id: -3, name: "原生 IP 服务器", slug: "isp-vps" },
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
    description:
      "服务器go 聚合 VPS、云服务器、独立服务器优惠和测评文章，把文章内容整理成更容易比较的选购入口。",
    navigationLabel: "页脚导航",
    topicTitle: "服务器专题",
    categoryTitle: "文章分类",
    utilityTitle: "常用入口",
    contactTitle: "联系与说明",
    languageLabel: "English",
    contactEmail: "contact@fwqgo.com",
    copyright: "服务器go 保留所有权利。",
    highlights: [
      { title: "套餐比价", href: "/servers" },
      { title: "优惠码", href: "/search?q=优惠码" },
      { title: "最新文章", href: "/fwq/page/1" },
    ],
    topics: [
      {
        title: "全部服务器比价",
        href: "/servers",
        description: "价格、地区、线路集中筛选",
      },
      {
        title: "香港服务器",
        href: "/servers/hong-kong",
        description: "CN2、CMI、低延迟线路",
      },
      {
        title: "美国服务器",
        href: "/servers/united-states",
        description: "VPS、独服、大带宽套餐",
      },
      {
        title: "便宜 VPS",
        href: "/servers/cheap-vps",
        description: "低价月付和测试机",
      },
    ],
    utilities: [
      {
        title: "服务器知识库",
        href: "/knowledge",
        description: "配置、线路、机房与 IP 基础知识",
      },
      {
        title: "站内搜索",
        href: "/search",
        description: "搜索商家、地区和优惠码",
      },
      {
        title: "高防服务器",
        href: "/fwq/ddos-vps/page/1",
        description: "防护、线路和应用场景",
      },
      {
        title: "出海服务器",
        href: "/fwq/export-vps/page/1",
        description: "海外业务与访问线路",
      },
      {
        title: "原生 IP 服务器",
        href: "/fwq/isp-vps/page/1",
        description: "住宅 IP、原生 IP 相关内容",
      },
    ],
  },
  en: {
    description:
      "fwqgo collects VPS, cloud server, dedicated server deals and reviews, then turns article content into easier comparison paths.",
    navigationLabel: "Footer navigation",
    topicTitle: "Server Topics",
    categoryTitle: "Article Categories",
    utilityTitle: "Useful Links",
    contactTitle: "Contact",
    languageLabel: "中文",
    contactEmail: "contact@fwqgo.com",
    copyright: "fwqgo. All rights reserved.",
    highlights: [
      { title: "Offer Compare", href: "/servers" },
      { title: "Coupons", href: "/search?lang=en&q=coupon" },
      { title: "Latest Articles", href: "/en/fwq/page/1" },
    ],
    topics: [
      {
        title: "All server offers",
        href: "/servers",
        description: "Compare price, region, route, and status",
      },
      {
        title: "Hong Kong servers",
        href: "/servers/hong-kong",
        description: "CN2, CMI, and low-latency routes",
      },
      {
        title: "US servers",
        href: "/servers/united-states",
        description: "VPS, dedicated, and bandwidth deals",
      },
      {
        title: "Cheap VPS",
        href: "/servers/cheap-vps",
        description: "Low-cost monthly VPS plans",
      },
    ],
    utilities: [
      {
        title: "Search",
        href: "/search?lang=en",
        description: "Find providers, regions, and coupons",
      },
      {
        title: "DDoS protected servers",
        href: "/en/fwq/ddos-vps/page/1",
        description: "Protection, routes, and use cases",
      },
      {
        title: "Offshore servers",
        href: "/en/fwq/export-vps/page/1",
        description: "International hosting and routes",
      },
      {
        title: "Native IP servers",
        href: "/en/fwq/isp-vps/page/1",
        description: "Native IP and residential IP topics",
      },
    ],
  },
} satisfies Record<
  PublicLanguage,
  {
    description: string;
    navigationLabel: string;
    topicTitle: string;
    categoryTitle: string;
    utilityTitle: string;
    contactTitle: string;
    languageLabel: string;
    contactEmail: string;
    copyright: string;
    highlights: FooterLink[];
    topics: FooterLink[];
    utilities: FooterLink[];
  }
>;

function categoryHref(slug: string, language: PublicLanguage) {
  return `${language === "en" ? "/en" : ""}/fwq/${encodeURIComponent(slug)}/page/1`;
}

function nonEmptyTrim(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

function FooterTextLink({ link }: { link: FooterLink }) {
  return (
    <Link
      href={link.href}
      prefetch
      className="group flex min-h-11 items-start justify-between gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="min-w-0">
        <span className="block font-medium text-foreground/90 underline-offset-4 group-hover:text-primary group-hover:underline">
          {link.title}
        </span>
        {link.description ? (
          <span className="mt-1 line-clamp-1 block text-xs leading-5 text-muted-foreground">
            {link.description}
          </span>
        ) : null}
      </span>
      <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </Link>
  );
}

function FooterGroupView({ group }: { group: FooterGroup }) {
  const Icon = group.icon;
  const titleId = `footer-${group.id}`;

  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <h2
        id={titleId}
        className="flex items-center gap-2 px-2 text-sm font-semibold text-foreground"
      >
        <Icon className="size-4 text-primary" />
        {group.title}
      </h2>
      <div className="mt-3 grid gap-1">
        {group.links.map((link) => (
          <FooterTextLink key={link.href} link={link} />
        ))}
      </div>
    </section>
  );
}

function FooterView({
  language = "zh",
  categories,
}: {
  language?: PublicLanguage;
  categories?: FooterCategory[];
}) {
  const copy = footerCopy[language];
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
    .slice(0, 6);

  const visibleQuickCategories =
    quickCategories.length > 0
      ? quickCategories
      : fallbackQuickCategories[language];
  const groups: FooterGroup[] = [
    {
      id: "topics",
      title: copy.topicTitle,
      icon: Server,
      links: copy.topics,
    },
    {
      id: "categories",
      title: copy.categoryTitle,
      icon: Tags,
      links: visibleQuickCategories.map((category) => ({
        title: category.name,
        href: categoryHref(category.slug, language),
      })),
    },
    {
      id: "utilities",
      title: copy.utilityTitle,
      icon: BookOpen,
      links: copy.utilities,
    },
  ];

  return (
    <footer className="border-t border-border/70 bg-muted/20 text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,2fr)]">
          <section className="min-w-0 space-y-5">
            <div>
              <BrandLogo
                compact
                className="items-start"
                textClassName="pt-0.5"
              />
              <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
                {copy.description}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {copy.highlights.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch
                  className="flex min-h-11 items-center justify-center rounded-md border border-border/70 bg-background px-2 text-center text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {link.title}
                </Link>
              ))}
            </div>

            <div className="grid gap-2 text-sm text-muted-foreground">
              <a
                href={`mailto:${copy.contactEmail}`}
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md px-2 transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Mail className="size-4 text-primary" />
                {copy.contactEmail}
              </a>
              <Suspense
                fallback={
                  <Link
                    href={language === "en" ? "/" : "/en"}
                    prefetch
                    className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md px-2 transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Globe2 className="size-4 text-primary" />
                    {copy.languageLabel}
                  </Link>
                }
              >
                <LanguageSwitchLink
                  currentLanguage={language}
                  prefetch
                  className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md px-2 transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Globe2 className="size-4 text-primary" />
                  {copy.languageLabel}
                </LanguageSwitchLink>
              </Suspense>
            </div>
          </section>

          <nav
            aria-label={copy.navigationLabel}
            className="grid gap-7 sm:grid-cols-2 xl:grid-cols-3"
          >
            {groups.map((group) => (
              <FooterGroupView key={group.title} group={group} />
            ))}
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border/70 pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; 2020-2026 {copy.copyright}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" />
              {language === "en"
                ? "Deal data needs final checkout verification"
                : "套餐价格以商家结算页为准"}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

async function FooterContent({
  language = "zh",
}: {
  language?: PublicLanguage;
}) {
  let categories: FooterCategory[] | undefined;

  try {
    const result = await getCategories();
    categories = result.data;
  } catch {
    categories = undefined;
  }

  return <FooterView language={language} categories={categories} />;
}

export default function FooterComponent({
  language = "zh",
}: {
  language?: PublicLanguage;
}) {
  return (
    <Suspense fallback={<FooterView language={language} />}>
      <FooterContent language={language} />
    </Suspense>
  );
}
