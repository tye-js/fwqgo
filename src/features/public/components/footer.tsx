import Link from "next/link";
import { Suspense } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BookOpen,
  Globe2,
  Mail,
  Rss,
  Server,
  ShieldCheck,
  Tags,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { LanguageSwitchLink } from "@/features/public/components/language-switch-link";
import {
  SITE_CONTACT,
  trustPagePath,
  type TrustPageSlug,
} from "@/features/public/lib/site-contact";
import {
  buildArticleNavigation,
  type ArticleNavigationSource,
} from "@/features/public/lib/article-navigation";

type PublicLanguage = "zh" | "en";

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

const TRUST_LINK_LABELS: Record<
  TrustPageSlug,
  { zh: string; en: string }
> = {
  about: { zh: "关于我们", en: "About" },
  contact: { zh: "联系我们", en: "Contact" },
  privacy: { zh: "隐私政策", en: "Privacy Policy" },
  terms: { zh: "服务条款", en: "Terms of Service" },
  "affiliate-disclosure": {
    zh: "推广与佣金披露",
    en: "Affiliate Disclosure",
  },
};

const TRUST_LINK_ORDER: TrustPageSlug[] = [
  "about",
  "contact",
  "privacy",
  "terms",
  "affiliate-disclosure",
];

function buildTrustLinks(language: PublicLanguage): FooterLink[] {
  return TRUST_LINK_ORDER.map((slug) => ({
    title: TRUST_LINK_LABELS[slug][language],
    href: trustPagePath(slug, language),
  }));
}

const footerCopy = {
  zh: {
    description:
      "服务器go 聚合 VPS、云服务器、独立服务器优惠和测评文章，把文章内容整理成更容易比较的选购入口。",
    navigationLabel: "页脚导航",
    topicTitle: "服务器专题",
    categoryTitle: "服务器分类",
    utilityTitle: "常用入口",
    contactTitle: "联系与说明",
    trustTitle: "信任与政策",
    languageLabel: "English",
    contactEmail: SITE_CONTACT.email,
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
        title: "服务器配置选择",
        href: "/tools/server-sizing",
        description: "结合业务规模估算资源需求",
      },
      {
        title: "网络线路选择",
        href: "/tools/network-lines",
        description: "从运营商与访问场景判断线路",
      },
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
    trustTitle: "Trust & Policies",
    languageLabel: "中文",
    contactEmail: SITE_CONTACT.email,
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
        title: "Server sizing",
        href: "/en/tools/server-sizing",
        description: "Plan resources around your workload",
      },
      {
        title: "Network routes",
        href: "/en/tools/network-lines",
        description: "Understand carriers and connectivity",
      },
      {
        title: "Server Knowledge Base",
        href: "/en/knowledge",
        description: "VPS, routing, regions, IP, and operations",
      },
      {
        title: "Search",
        href: "/search?lang=en",
        description: "Find providers, regions, and coupons",
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
    trustTitle: string;
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

function FooterTextLink({ link }: { link: FooterLink }) {
  return (
    <Link
      href={link.href}
      prefetch={false}
      className="group flex min-h-11 items-start justify-between gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="min-w-0">
        <span className="block font-medium text-foreground/90 underline-offset-4 group-hover:text-primary group-hover:underline">
          {link.title}
        </span>
        {link.description ? (
          <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">
            {link.description}
          </span>
        ) : null}
      </span>
      <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </Link>
  );
}

function ContactEmailLink({ email }: { email: string }) {
  const atIndex = email.indexOf("@");
  const localPart = atIndex >= 0 ? email.slice(0, atIndex) : email;
  const domain = atIndex >= 0 ? email.slice(atIndex + 1) : "";
  const href =
    atIndex >= 0
      ? `mailto:${encodeURIComponent(localPart)}%40${encodeURIComponent(domain)}`
      : `mailto:${encodeURIComponent(email)}`;

  return (
    <a
      href={href}
      className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md px-2 transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Mail className="size-4 text-primary" />
      <span className="break-all">
        {localPart}
        {atIndex >= 0 ? "@" : null}
        {domain}
      </span>
    </a>
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
  categories?: ArticleNavigationSource[];
}) {
  const copy = footerCopy[language];
  const quickCategories = buildArticleNavigation(
    categories ?? [],
    language,
  ).slice(0, 6);

  const groups: FooterGroup[] = [
    {
      id: "topics",
      title: copy.topicTitle,
      icon: Server,
      links: copy.topics,
    },
    ...(quickCategories.length > 0
      ? [
          {
            id: "categories",
            title: copy.categoryTitle,
            icon: Tags,
            links: quickCategories.map((category) => ({
              title: category.name,
              href: categoryHref(category.slug, language),
            })),
          } satisfies FooterGroup,
        ]
      : []),
    {
      id: "utilities",
      title: copy.utilityTitle,
      icon: BookOpen,
      links: copy.utilities,
    },
    {
      id: "trust",
      title: copy.trustTitle,
      icon: ShieldCheck,
      links: buildTrustLinks(language),
    },
  ];

  return (
    <footer className="border-t border-border/70 bg-card text-foreground">
      <div className="public-container pb-[max(2rem,calc(env(safe-area-inset-bottom)+2rem))] pt-10">
        <div className="mb-9 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-7">
          <div>
            <p className="public-kicker mb-2">FWQGO / CLOUD INFRASTRUCTURE</p>
            <p className="font-editorial text-xl font-semibold sm:text-2xl">
              {language === "en"
                ? "Understand more. Choose with confidence."
                : "看懂技术，选对服务器。"}
            </p>
          </div>
          <Link
            href={language === "en" ? "/en/knowledge" : "/knowledge"}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary/5 px-5 text-sm font-semibold text-primary hover:bg-primary/10"
          >
            {language === "en" ? "Explore the knowledge base" : "探索知识库"}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
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

            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
              {copy.highlights.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch={false}
                  className="flex min-h-11 items-center justify-center rounded-md border border-border/70 bg-background px-2 text-center text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {link.title}
                </Link>
              ))}
            </div>

            <div className="grid gap-2 text-sm text-muted-foreground">
              <ContactEmailLink email={copy.contactEmail} />
              <Suspense
                fallback={
                  <Link
                    href={language === "en" ? "/" : "/en"}
                    prefetch={false}
                    className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md px-2 transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Globe2 className="size-4 text-primary" />
                    {copy.languageLabel}
                  </Link>
                }
              >
                <LanguageSwitchLink
                  currentLanguage={language}
                  prefetch={false}
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
            <a
              href="/feed.xml"
              className="inline-flex min-h-11 items-center gap-1.5 font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Rss className="size-3.5" aria-hidden="true" />
              {language === "en" ? "RSS feed" : "RSS 订阅"}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function FooterComponent({
  language = "zh",
}: {
  language?: PublicLanguage;
}) {
  // Footer links are intentionally curated and static. They are below the
  // fold, so a taxonomy query must not delay the article document or create a
  // second streamed footer tree.
  return <FooterView language={language} />;
}
