import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Cpu,
  Globe2,
  Minus,
  Server,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PublicSectionHeading } from "@/features/public/components/public-section-heading";
import {
  mailtoHref,
  SITE_CONTACT,
  type PublicLanguage,
} from "@/features/public/lib/site-contact";

/**
 * Real counts only. Every field is optional: a metric that cannot be read is
 * omitted rather than replaced with a rounded-up placeholder, because a trust
 * page that inflates its own numbers is worse than one that shows fewer.
 */
export type AboutStats = {
  offerCount?: number;
  providerCount?: number;
  knowledgeCount?: number;
  postCount?: number;
};

type Capability = {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
};

type AboutCopy = {
  kicker: string;
  heading: string;
  intro: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  snapshotTitle: string;
  snapshot: Array<{ label: string; value: string }>;
  snapshotNote: string;
  capabilityEyebrow: string;
  capabilityTitle: string;
  capabilityDescription: string;
  capabilities: Capability[];
  statsEyebrow: string;
  statsTitle: string;
  statLabels: {
    offerCount: string;
    providerCount: string;
    knowledgeCount: string;
    postCount: string;
  };
  principlesEyebrow: string;
  principlesTitle: string;
  principles: Array<{ title: string; body: string }>;
  processEyebrow: string;
  processTitle: string;
  process: Array<{ title: string; body: string }>;
  boundariesEyebrow: string;
  boundariesTitle: string;
  boundaries: string[];
  contactEyebrow: string;
  contactTitle: string;
  contactDescription: string;
  contactCta: string;
  faqEyebrow: string;
  faqTitle: string;
  faq: Array<{ question: string; answer: string }>;
  ctaTitle: string;
  ctaPrimary: { label: string; href: string };
  ctaSecondary: { label: string; href: string };
};

const aboutCopy: Record<PublicLanguage, AboutCopy> = {
  zh: {
    kicker: "关于服务器GO",
    heading: "我们只做一件事：把服务器这件事讲清楚。",
    intro:
      "服务器GO 是一个独立的服务器选购研究站。我们汇总 VPS、云服务器与独立服务器的公开套餐信息，整理成可筛选、可比较的条目，并用知识库和选购工具补齐判断依据。",
    primaryCta: { label: "浏览服务器比价", href: "/servers" },
    secondaryCta: { label: "打开知识库", href: "/knowledge" },
    snapshotTitle: "站点速览",
    snapshot: [
      { label: "内容语言", value: "中文 / English" },
      { label: "数据更新", value: "跟随商家公开页滚动更新" },
      { label: "内容范围", value: "套餐比价 · 测评 · 知识库 · 选购工具" },
      { label: "联系方式", value: SITE_CONTACT.email },
    ],
    snapshotNote: "套餐价格、库存与活动条件均以商家结算页为准。",
    capabilityEyebrow: "WHAT WE DO",
    capabilityTitle: "站内四条主线，各解决一个问题",
    capabilityDescription:
      "它们彼此独立，但共用同一套判断口径：可核验的字段优先于营销话术。",
    capabilities: [
      {
        icon: Server,
        title: "套餐比价",
        description:
          "把分散在商家页面的价格、地区、线路与库存整理成可筛选的条目。",
        href: "/servers",
      },
      {
        icon: BookOpen,
        title: "测评与指南",
        description: "结合真实使用场景，说明一款套餐适合谁、不适合谁。",
        href: "/fwq/page/1",
      },
      {
        icon: Cpu,
        title: "选购工具",
        description: "按业务规模估算配置，按访问地区判断线路。",
        href: "/tools/server-sizing",
      },
      {
        icon: Globe2,
        title: "知识库",
        description: "把配置、线路、机房、IP 这些概念讲成人话。",
        href: "/knowledge",
      },
    ],
    statsEyebrow: "BY THE NUMBERS",
    statsTitle: "当前收录规模",
    statLabels: {
      offerCount: "收录套餐",
      providerCount: "覆盖商家",
      knowledgeCount: "知识库条目",
      postCount: "文章",
    },
    principlesEyebrow: "EDITORIAL PRINCIPLES",
    principlesTitle: "我们怎么判断一条信息能不能写",
    principles: [
      {
        title: "价格与参数只写可核验的。",
        body: "所有套餐信息以商家公开页面为准，我们不改写、不推测、不补全缺失字段。价格会标注采集时间。",
      },
      {
        title: "收录不收费，排序不售卖。",
        body: "商家是否被收录、出现在哪个位置，都不接受付费影响。排序依据是地区、价格、线路、库存等可核验字段。",
      },
      {
        title: "有推广关系就说清楚。",
        body: "含推广链接的内容会在页面上标注。推广不影响该内容的结论，也不影响它是否被收录。",
      },
      {
        title: "发现错误就改，并留下痕迹。",
        body: "任何人都可以通过邮件或社群指出错误，我们核实后修正内容。修正不静默进行。",
      },
    ],
    processEyebrow: "HOW CONTENT IS MADE",
    processTitle: "从商家页面到你能看到的条目",
    process: [
      {
        title: "采集",
        body: "从商家公开页面与公告抓取套餐、价格与库存变化。",
      },
      {
        title: "规范化",
        body: "统一地区、线路、计费周期等字段口径，过滤过期与失效条目。",
      },
      {
        title: "人工复核",
        body: "对价格、续费条件、线路等关键字段抽样核对后再发布。",
      },
      {
        title: "发布与更新",
        body: "内容上线后持续跟随商家变更滚动更新，并标注最近更新时间。",
      },
    ],
    boundariesEyebrow: "BOUNDARIES",
    boundariesTitle: "我们不做这些",
    boundaries: [
      "不出售服务器，不代收任何款项",
      "不售卖收录位与排名",
      "不隐瞒推广关系",
      "不发布无法核验的价格与参数",
    ],
    contactEyebrow: "CONTACT",
    contactTitle: "联系与协作",
    contactDescription:
      "内容纠错、投稿、商家提交优惠与商务合作，我们按身份分流，避免你的消息石沉大海。",
    contactCta: "查看全部联系方式",
    faqEyebrow: "FAQ",
    faqTitle: "常见问题",
    faq: [
      {
        question: "站上的价格为什么和商家页面不一样？",
        answer:
          "价格按采集时点记录，商家随时可能调整或结束活动。下单时请以商家结算页显示的价格与条件为准。如果你发现明显过期，欢迎告诉我们。",
      },
      {
        question: "收录商家需要付费吗？",
        answer:
          "不需要。商家能否被收录，取决于它的套餐是否有公开可核验的信息，与是否付费无关。我们也不出售收录位。",
      },
      {
        question: "你们推荐某个套餐，是有推广关系吗？",
        answer:
          "部分购买链接带有推广关系，我们会在页面标注。佣金不会影响收录与排序，也不会增加你的支出。详见《推广与佣金披露》。",
      },
      {
        question: "发现内容有错怎么办？",
        answer:
          "把页面地址、你认为有误的字段，以及正确值的公开来源发给我们即可。核实后我们会修正内容，不静默处理。",
      },
      {
        question: "可以转载你们的内容吗？",
        answer:
          "原创内容需要先取得授权。请说明转载用途与范围，我们在评估后回复。",
      },
    ],
    ctaTitle: "接下来，从这两处开始。",
    ctaPrimary: { label: "浏览全部套餐", href: "/servers" },
    ctaSecondary: { label: "进入知识库", href: "/knowledge" },
  },
  en: {
    kicker: "ABOUT FWQGO",
    heading: "We make server decisions easier to verify.",
    intro:
      "fwqgo is an independent research site for server buying decisions. We collect publicly available VPS, cloud and dedicated server plans into entries you can filter and compare, then back them with a knowledge base and sizing tools.",
    // English has no /en/servers tree yet, so offer comparison points at the
    // shared /servers table — the same target the English footer already uses.
    primaryCta: { label: "Compare server offers", href: "/servers" },
    secondaryCta: { label: "Open the knowledge base", href: "/en/knowledge" },
    snapshotTitle: "At a glance",
    snapshot: [
      { label: "Languages", value: "中文 / English" },
      { label: "Data updates", value: "Rolling, following provider pages" },
      {
        label: "Scope",
        value: "Plan comparison · Reviews · Knowledge base · Tools",
      },
      { label: "Contact", value: SITE_CONTACT.email },
    ],
    snapshotNote:
      "Plan prices, stock and promotion terms are always governed by the provider's checkout page.",
    capabilityEyebrow: "WHAT WE DO",
    capabilityTitle: "Four tracks, each solving one problem",
    capabilityDescription:
      "They are independent, but share one standard: verifiable fields outrank marketing copy.",
    capabilities: [
      {
        icon: Server,
        title: "Plan comparison",
        description:
          "Provider prices, regions, routes and stock, turned into filterable entries.",
        href: "/servers",
      },
      {
        icon: BookOpen,
        title: "Reviews and guides",
        description:
          "Which workloads a plan suits, and which it does not, grounded in real use.",
        href: "/en/fwq/page/1",
      },
      {
        icon: Cpu,
        title: "Sizing tools",
        description:
          "Estimate resources from workload, judge routes from where users are.",
        href: "/en/tools/server-sizing",
      },
      {
        icon: Globe2,
        title: "Knowledge base",
        description:
          "Specifications, routes, datacentres and IP types, explained plainly.",
        href: "/en/knowledge",
      },
    ],
    statsEyebrow: "BY THE NUMBERS",
    statsTitle: "Current coverage",
    statLabels: {
      offerCount: "Plans listed",
      providerCount: "Providers covered",
      knowledgeCount: "Knowledge articles",
      postCount: "Articles",
    },
    principlesEyebrow: "EDITORIAL PRINCIPLES",
    principlesTitle: "How we decide what is publishable",
    principles: [
      {
        title: "Only verifiable prices and specifications.",
        body: "Plan data follows the provider's public pages. We do not rewrite, infer or fill in missing fields, and prices carry a collection timestamp.",
      },
      {
        title: "Listing is free, ranking is not for sale.",
        body: "Whether a provider is listed, and where it appears, is never influenced by payment. Ordering uses verifiable fields such as region, price, route and stock.",
      },
      {
        title: "Disclose every promotion relationship.",
        body: "Content containing affiliate links is labelled on the page. Commission never changes a conclusion, and never changes whether something is listed.",
      },
      {
        title: "Correct mistakes, and leave a trail.",
        body: "Anyone can report an error by email or in our community. We verify and correct, and we do not correct silently.",
      },
    ],
    processEyebrow: "HOW CONTENT IS MADE",
    processTitle: "From provider page to the entry you read",
    process: [
      {
        title: "Collect",
        body: "Plans, prices and stock changes are collected from provider pages and announcements.",
      },
      {
        title: "Normalise",
        body: "Region, route and billing-period fields are standardised; expired entries are filtered out.",
      },
      {
        title: "Human review",
        body: "Key fields such as price, renewal terms and route are spot-checked before publishing.",
      },
      {
        title: "Publish and maintain",
        body: "Entries keep tracking provider changes after launch, with the last update shown.",
      },
    ],
    boundariesEyebrow: "BOUNDARIES",
    boundariesTitle: "What we do not do",
    boundaries: [
      "We do not sell servers and never take payments on a provider's behalf",
      "We do not sell listing slots or ranking positions",
      "We do not hide promotion relationships",
      "We do not publish prices or specifications we cannot verify",
    ],
    contactEyebrow: "CONTACT",
    contactTitle: "Contact and contributions",
    contactDescription:
      "Error reports, submissions, provider deals and partnerships are routed by role, so your message reaches the right place.",
    contactCta: "See all contact routes",
    faqEyebrow: "FAQ",
    faqTitle: "Common questions",
    faq: [
      {
        question: "Why is the price here different from the provider's page?",
        answer:
          "Prices are recorded at collection time and providers change or end promotions at will. At checkout, the provider's page governs. If something looks clearly expired, tell us.",
      },
      {
        question: "Does it cost money to be listed?",
        answer:
          "No. Listing depends on whether a provider's plans carry publicly verifiable information, not on payment. We do not sell listing slots.",
      },
      {
        question: "If you recommend a plan, are you being paid?",
        answer:
          "Some purchase links are affiliate links, and we label them. Commission does not affect listing or ranking, and does not increase what you pay. See our Affiliate Disclosure.",
      },
      {
        question: "What if I find an error?",
        answer:
          "Send the page URL, the field you believe is wrong, and a public source for the correct value. Once verified we correct it, and never silently.",
      },
      {
        question: "Can I republish your content?",
        answer:
          "Original content requires permission first. Tell us the intended use and scope and we will respond after review.",
      },
    ],
    ctaTitle: "Start from one of these.",
    ctaPrimary: { label: "Open the knowledge base", href: "/en/knowledge" },
    ctaSecondary: { label: "Read the latest articles", href: "/en/fwq/page/1" },
  },
};

function formatCount(value: number, english: boolean) {
  return new Intl.NumberFormat(english ? "en-US" : "zh-CN").format(value);
}

export function AboutPage({
  language,
  stats,
}: {
  language: PublicLanguage;
  stats: AboutStats;
}) {
  const copy = aboutCopy[language];
  const english = language === "en";
  const contactHref = english ? "/en/contact" : "/contact";
  const disclosureHref = english
    ? "/en/affiliate-disclosure"
    : "/affiliate-disclosure";

  const metrics = (
    [
      ["offerCount", stats.offerCount],
      ["providerCount", stats.providerCount],
      ["knowledgeCount", stats.knowledgeCount],
      ["postCount", stats.postCount],
    ] as const
  ).filter((entry): entry is readonly [keyof AboutStats, number] =>
    typeof entry[1] === "number" && Number.isFinite(entry[1]),
  );

  return (
    <main id="main-content" className="min-w-0 flex-1">
      {/* 1. Hero + snapshot */}
      <section className="public-hero">
        <div className="public-container grid gap-7 py-9 md:py-12 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center">
          <div className="min-w-0">
            <p className="public-kicker">{copy.kicker}</p>
            <h1 className="font-editorial mt-4 max-w-3xl break-words text-3xl font-semibold leading-tight tracking-tight sm:text-4xl xl:text-5xl">
              {copy.heading}
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
              {copy.intro}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href={copy.primaryCta.href}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {copy.primaryCta.label}
              </Link>
              <Link
                href={copy.secondaryCta.href}
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-border px-6 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {copy.secondaryCta.label}
              </Link>
            </div>
          </div>

          <div className="public-panel min-w-0 p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {copy.snapshotTitle}
            </h2>
            <dl className="mt-3 divide-y divide-border/70">
              {copy.snapshot.map((row) => (
                <div
                  key={row.label}
                  className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm"
                >
                  <dt className="shrink-0 text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="min-w-0 break-words text-right font-medium text-foreground">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 border-t border-border/70 pt-3 text-xs leading-6 text-foreground">
              {copy.snapshotNote}
            </p>
          </div>
        </div>
      </section>

      <div className="public-container space-y-10 py-10 md:space-y-14">
        {/* 2. Capabilities */}
        <section aria-labelledby="about-capabilities">
          <PublicSectionHeading
            title={copy.capabilityTitle}
            description={copy.capabilityDescription}
            eyebrow={copy.capabilityEyebrow}
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {copy.capabilities.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.title}
                  href={item.href}
                  prefetch={false}
                  className="public-panel flex flex-col p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Icon
                    className="size-5 text-primary"
                    aria-hidden="true"
                  />
                  <h3 className="mt-3 text-base font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                    {english ? "Open" : "进入"}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* 3. Real numbers only */}
        {metrics.length > 0 ? (
          <section aria-labelledby="about-stats">
            <PublicSectionHeading
              title={copy.statsTitle}
              eyebrow={copy.statsEyebrow}
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map(([key, value]) => (
                <div key={key} className="public-panel p-5">
                  <p className="public-stat text-3xl font-semibold tabular-nums text-foreground">
                    {formatCount(value, english)}
                  </p>
                  <p className="mt-2 text-xs font-medium text-muted-foreground">
                    {copy.statLabels[key]}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* 4. Editorial principles — the core block */}
        <section aria-labelledby="about-principles">
          <PublicSectionHeading
            title={copy.principlesTitle}
            eyebrow={copy.principlesEyebrow}
          />
          <div className="public-panel border-l-4 border-l-primary p-6 sm:p-8">
            <ol className="space-y-6">
              {copy.principles.map((principle, index) => (
                <li
                  key={principle.title}
                  className="border-b border-border/70 pb-6 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="public-stat mt-0.5 text-lg text-primary/70"
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-foreground">
                        {principle.title}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">
                        {principle.body}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 border-t border-border/70 pt-4 text-sm leading-7 text-muted-foreground">
              {english
                ? "How commission works, in detail: "
                : "佣金规则详见："}
              <Link
                href={disclosureHref}
                className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
              >
                {english
                  ? "Affiliate Disclosure"
                  : "《推广与佣金披露》"}
              </Link>
            </p>
          </div>
        </section>

        {/* 5. Process */}
        <section aria-labelledby="about-process">
          <PublicSectionHeading
            title={copy.processTitle}
            eyebrow={copy.processEyebrow}
          />
          <ol className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4">
            {copy.process.map((step, index) => (
              <li key={step.title} className="col-span-2 grid grid-cols-subgrid">
                <div className="flex flex-col items-center pt-1.5">
                  <span
                    className="size-3 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  {index < copy.process.length - 1 ? (
                    <span
                      className="mt-1 w-px flex-1 bg-border"
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 pb-6 last:pb-0">
                  <h3 className="text-sm font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* 6. Boundaries */}
        <section aria-labelledby="about-boundaries">
          <PublicSectionHeading
            title={copy.boundariesTitle}
            eyebrow={copy.boundariesEyebrow}
          />
          <ul className="grid gap-3 sm:grid-cols-2">
            {copy.boundaries.map((boundary) => (
              <li
                key={boundary}
                className="flex items-start gap-2.5 rounded-2xl border border-dashed border-border px-5 py-4 text-sm leading-7 text-foreground"
              >
                <Minus
                  className="mt-2 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 break-words">{boundary}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 7. Contact pointer */}
        <section aria-labelledby="about-contact">
          <PublicSectionHeading
            title={copy.contactTitle}
            description={copy.contactDescription}
            eyebrow={copy.contactEyebrow}
          />
          <div className="public-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <a
              href={mailtoHref()}
              className="inline-flex min-h-11 items-center gap-2 break-all text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {SITE_CONTACT.email}
            </a>
            <Link
              href={contactHref}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              {copy.contactCta}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* 8. FAQ */}
        <section aria-labelledby="about-faq">
          <PublicSectionHeading
            title={copy.faqTitle}
            eyebrow={copy.faqEyebrow}
          />
          <div className="divide-y divide-border/70 rounded-2xl border border-border bg-card">
            {copy.faq.map((item) => (
              <details key={item.question} className="group px-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <span className="min-w-0 break-words">{item.question}</span>
                  <span
                    className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="pb-4 text-sm leading-7 text-muted-foreground">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* 9. Closing CTA */}
        <section
          aria-labelledby="about-cta"
          className="rounded-2xl border border-primary/15 bg-primary/5 p-6 sm:p-8"
        >
          <h2 id="about-cta" className="text-xl font-semibold text-foreground">
            {copy.ctaTitle}
          </h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              href={copy.ctaPrimary.href}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {copy.ctaPrimary.label}
            </Link>
            <Link
              href={copy.ctaSecondary.href}
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-border px-6 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {copy.ctaSecondary.label}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
