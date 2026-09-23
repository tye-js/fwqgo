import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgePercent,
  BookOpen,
  CircleCheck,
  Globe2,
  Search,
  Server,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PostWithTags } from "@/types";
import { formatDate, isHttpHref, isInternalHref } from "@fwqgo/core/utils";
import type { getHomepageSidebarData } from "@/features/public/data/post";
import type { listPublishedKnowledgeArticles } from "@/features/public/data/knowledge";
import type {
  getLatestServerOffers,
  getServerOfferCollectionIndex,
  getServerOfferTopicCounts,
} from "@/server/offers/server-offers";
import ArticleCard from "./article-card";
import { HeroTagSearch } from "./hero-tag-search";
import { KnowledgeCard } from "./knowledge-card";
import { PublicDiscovery } from "./public-discovery";
import { PublicSectionHeading } from "./public-section-heading";
import {
  HomepagePrimaryPromotion,
  HomepagePromotionGrid,
  HomepageSidebarPromotions,
  type ActiveHomepageSlot,
} from "./homepage-promotion-slots";

type HomeOffer = Awaited<ReturnType<typeof getLatestServerOffers>>[number];
type SidebarPost = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
};

export type PublicHomePageProps = {
  language?: "zh" | "en";
  posts: PostWithTags[];
  sidebarData: Awaited<ReturnType<typeof getHomepageSidebarData>>["data"];
  latestOffers: HomeOffer[];
  offerCounts: Awaited<ReturnType<typeof getServerOfferTopicCounts>>;
  totalOfferCount: number;
  homepageSlots: ActiveHomepageSlot[];
  collections: Awaited<ReturnType<typeof getServerOfferCollectionIndex>>;
  knowledge: Awaited<
    ReturnType<typeof listPublishedKnowledgeArticles>
  >["items"];
};

function CouponLink({ offer }: { offer: HomeOffer }) {
  const articleHref = offer.articleUrl?.trim();
  const providerName = offer.providerName?.trim();
  const href = articleHref?.length ? articleHref : "/servers";
  const content = (
    <>
      <span className="min-w-0 flex-1 break-words text-foreground">
        {providerName?.length ? providerName : offer.title}
      </span>
      <span className="max-w-[45%] shrink-0 break-all rounded-md border border-dashed border-primary/30 bg-primary/5 px-2.5 py-1.5 text-right font-mono text-xs font-semibold text-primary">
        {offer.promoCode}
      </span>
    </>
  );
  const className =
    "flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted";
  return isInternalHref(href) ? (
    <Link href={href} prefetch={false} className={className}>
      {content}
    </Link>
  ) : isHttpHref(href) ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {content}
    </a>
  ) : null;
}

function ReadingLink({
  post,
  index,
  language,
}: {
  post: SidebarPost;
  index: number;
  language: "zh" | "en";
}) {
  return (
    <Link
      href={`${language === "en" ? "/en" : ""}/fwq/posts/${encodeURIComponent(post.slug)}`}
      prefetch={false}
      className="group flex min-h-11 gap-3 border-b border-border/70 py-4 last:border-0"
    >
      <span className="public-stat mt-0.5 text-lg font-medium text-primary/70">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="min-w-0">
        <span className="block break-words text-sm font-medium leading-6 text-foreground group-hover:text-primary">
          {post.title}
        </span>
        {post.description ? (
          <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
            {post.description}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * 首页文章区各档位取用条数。
 *
 * 三者之和必须不超过数据层的 `HOMEPAGE_POST_QUERY_LIMIT`（`data/post.ts`），
 * 否则切片会静默少渲染几张卡片。
 */
const HOMEPAGE_LEAD_COUNT = 1;
const HOMEPAGE_SECONDARY_COUNT = 2;
const HOMEPAGE_FEED_COUNT = 6;

/**
 * 首页优惠码块的条数。优惠码是在内存里从最新套餐里挑的（查询按 `featured`、`createdAt`
 * 排序，SQL 层筛不出「有优惠码」），所以取多少条最新套餐决定了这里能凑出几条优惠码：
 * 路由层按这个数字的 2 倍取数，凑不满就少显示几条，不额外回查。
 */
const HOMEPAGE_COUPON_COUNT = 4;

export function PublicHomePage({
  language = "zh",
  posts,
  sidebarData,
  latestOffers,
  offerCounts,
  totalOfferCount,
  homepageSlots,
  collections,
  knowledge,
}: PublicHomePageProps) {
  const english = language === "en";
  const prefix = english ? "/en" : "";
  const number = (value: number) =>
    value.toLocaleString(english ? "en-US" : "zh-CN");
  const lead = posts[0];
  const secondary = posts.slice(
    HOMEPAGE_LEAD_COUNT,
    HOMEPAGE_LEAD_COUNT + HOMEPAGE_SECONDARY_COUNT,
  );
  const feed = posts.slice(
    HOMEPAGE_LEAD_COUNT + HOMEPAGE_SECONDARY_COUNT,
    HOMEPAGE_LEAD_COUNT + HOMEPAGE_SECONDARY_COUNT + HOMEPAGE_FEED_COUNT,
  );
  const heroSlot = homepageSlots.find(
    (slot) => slot.placement === "hero_primary",
  );
  const promoSlots = homepageSlots.filter(
    (slot) => slot.placement === "promo_grid",
  );
  const sidebarSlots = homepageSlots.filter(
    (slot) => slot.placement === "sidebar",
  );
  const editorPicks = sidebarData?.editorPicks ?? [];
  const promotedPosts = sidebarData?.promotedPosts ?? [];
  const coupons = latestOffers
    .filter((offer) => offer.promoCode?.trim())
    .slice(0, HOMEPAGE_COUPON_COUNT);
  const latestUpdate = latestOffers
    .map((offer) => offer.updatedAt ?? offer.createdAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const quickLinks: Array<[string, string]> = english
    ? [
        ["Hong Kong", "/servers/hong-kong"],
        ["US servers", "/servers/united-states"],
        ["Cheap VPS", "/servers/cheap-vps"],
        ["CN2 routes", "/search?lang=en&q=CN2"],
      ]
    : [
        ["香港服务器", "/servers/hong-kong"],
        ["美国服务器", "/servers/united-states"],
        ["便宜 VPS", "/servers/cheap-vps"],
        ["CN2 线路", "/search?q=CN2"],
      ];

  return (
    <main id="main-content" className="min-w-0 flex-1">
      <section className="public-hero">
        <div className="public-container grid gap-7 py-9 md:py-12 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center">
          <div className="min-w-0">
            <p className="public-kicker">
              {english
                ? "CLOUD INFRASTRUCTURE, MADE CLEAR"
                : "服务器优惠 · 技术阅读 · 理性选购"}
            </p>
            <h1 className="font-editorial mt-4 max-w-3xl break-words text-3xl font-semibold leading-tight tracking-tight sm:text-4xl xl:text-5xl">
              {english
                ? "Your next server starts here."
                : "发现好服务器，读懂每个选择。"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
              {english
                ? "Explore offers, understand the technology, and compare the details that matter to your next project."
                : "从最新优惠到技术指南，把价格、配置和线路看清楚，为下一个项目找到合适的服务器。"}
            </p>
            <div className="mt-6 max-w-2xl">
              {english ? (
                <form
                  action="/search"
                  method="get"
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  <input type="hidden" name="lang" value="en" />
                  <label className="relative min-w-0 flex-1">
                    <span className="sr-only">
                      Search server offers and articles
                    </span>
                    <Search
                      className="pointer-events-none absolute left-4 top-4 size-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      name="q"
                      placeholder="Search providers, regions, guides…"
                      className="h-14 w-full rounded-xl border border-border bg-card pl-12 pr-4 text-base shadow-sm"
                    />
                  </label>
                  <Button type="submit" className="h-14 rounded-xl px-6">
                    Search
                    <ArrowRight className="size-4" />
                  </Button>
                </form>
              ) : (
                <HeroTagSearch />
              )}
            </div>
            <nav
              aria-label={english ? "Popular searches" : "热门搜索"}
              className="mt-3 flex flex-wrap gap-x-4 gap-y-1"
            >
              {quickLinks.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary"
                >
                  {label}
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              ))}
            </nav>
          </div>
          <aside className="public-panel relative p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
              <span>
                {english ? "EXPLORE THE INVENTORY" : "从真实库存开始选购"}
              </span>
              <Server className="size-4 text-primary" aria-hidden="true" />
            </div>
            {totalOfferCount > 0 ? (
              <p className="mt-3 flex flex-wrap items-baseline gap-2">
                <span className="public-stat text-4xl font-semibold">
                  {number(totalOfferCount)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {english ? "server offers" : "个可购买套餐"}
                </span>
              </p>
            ) : (
              <p className="mt-4 text-xl font-semibold">
                {english ? "Compare what matters." : "让选择更有依据"}
              </p>
            )}
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              {latestUpdate
                ? `${english ? "Updated " : "套餐更新于 "}${formatDate(latestUpdate, english ? "en-US" : "zh-CN")}`
                : english
                  ? "Price, location, network and availability in one place."
                  : "集中查看价格、地区、线路与库存状态。"}
            </p>
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              {offerCounts.slice(0, 3).map((topic) => (
                <Link
                  key={topic.slug}
                  href={`/servers/${topic.slug}`}
                  prefetch={false}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-sm hover:bg-muted"
                >
                  <span>
                    {topic.slug === "hong-kong"
                      ? english
                        ? "Hong Kong"
                        : "香港服务器"
                      : topic.slug === "united-states"
                        ? english
                          ? "United States"
                          : "美国服务器"
                        : topic.slug === "cheap-vps"
                          ? english
                            ? "Cheap VPS"
                            : "便宜 VPS"
                          : topic.slug}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {number(topic.count)}
                    <span className="sr-only">
                      {english ? " offers" : " 个套餐"}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            <Link
              href="/servers"
              className="mt-3 flex min-h-11 items-center justify-between gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              {english ? "Browse all offers" : "查看全部服务器"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </section>

      <div className="public-container space-y-10 py-8 md:space-y-14 md:py-10">
        {lead ? (
          <section>
            <PublicSectionHeading
              title={english ? "Fresh from the journal" : "新近发布，值得一读"}
              eyebrow={english ? "THE LATEST" : "发现新内容"}
              href={`${prefix}/fwq/page/1`}
              linkLabel={english ? "All articles" : "浏览全部文章"}
            />
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <ArticleCard post={lead} language={language} variant="feature" />
              <div className="grid gap-4">
                {secondary.map((post) => (
                  <ArticleCard
                    key={post.id}
                    post={post}
                    language={language}
                    variant="compact"
                  />
                ))}
                <div className="rounded-xl border border-primary/15 bg-primary/5 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <BookOpen
                      className="size-4 text-primary"
                      aria-hidden="true"
                    />
                    {english
                      ? "A useful place to begin"
                      : "准备入手第一台服务器？"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {english
                      ? "Start with the users, workload and budget. Our knowledge base helps you ask the right questions."
                      : "先明确用户、用途和预算。用知识库补齐基础，再比较套餐细节。"}
                  </p>
                  <Link
                    href={`${prefix}/knowledge`}
                    className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
                  >
                    {english ? "Explore the knowledge base" : "打开选购知识库"}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section>
          <PublicSectionHeading
            title={
              english
                ? "A clearer path to the right server"
                : "选服务器，从你的需求出发"
            }
            description={
              english
                ? "Practical resources for each step, from understanding the basics to comparing your shortlist."
                : "把选购拆成几个简单的问题，找到适合自己的下一步。"
            }
          />
          <PublicDiscovery language={language} />
        </section>

        {promoSlots.length > 0 ? (
          <section>
            <PublicSectionHeading
              title={english ? "In the spotlight" : "特别推荐"}
            />
            <HomepagePromotionGrid slots={promoSlots} />
          </section>
        ) : null}

        <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_310px]">
          <div className="min-w-0 space-y-10">
            {feed.length > 0 ? (
              <section>
                <PublicSectionHeading
                  title={
                    english
                      ? "Deals, reviews & perspectives"
                      : "优惠、测评与选购指南"
                  }
                  description={
                    english
                      ? "Keep reading the latest published articles."
                      : "继续阅读近期更新，从不同角度了解服务器与云产品。"
                  }
                />
                <div className="space-y-4">
                  {feed.map((post) => (
                    <ArticleCard
                      key={post.id}
                      post={post}
                      language={language}
                    />
                  ))}
                </div>
                <Link
                  href={`${prefix}/fwq/page/1`}
                  className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {english ? "Continue to all articles" : "继续浏览全部文章"}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </section>
            ) : !lead ? (
              <section className="public-panel p-7">
                <PublicSectionHeading
                  title={
                    english
                      ? "The journal is getting ready"
                      : "更多文章正在准备中"
                  }
                  description={
                    english
                      ? "Explore the knowledge base and server tools while new articles are being added."
                      : "你可以先浏览知识库，或使用选购工具梳理需求。"
                  }
                  href={`${prefix}/knowledge`}
                  linkLabel={english ? "Browse knowledge" : "浏览知识库"}
                />
              </section>
            ) : null}

            {collections.regions.length > 0 ||
            collections.providers.length > 0 ? (
              <section className="public-panel p-5 sm:p-6">
                <PublicSectionHeading
                  title={
                    english
                      ? "Explore the server directory"
                      : "按地区与商家继续探索"
                  }
                  href="/servers"
                  linkLabel={english ? "Full directory" : "完整库存"}
                />
                <div className="grid gap-6 sm:grid-cols-2">
                  {[
                    {
                      icon: Globe2,
                      label: english ? "Regions" : "热门地区",
                      segment: "regions",
                      entries: collections.regions,
                    },
                    {
                      icon: Store,
                      label: english ? "Providers" : "收录商家",
                      segment: "providers",
                      entries: collections.providers,
                    },
                  ].map(({ icon: Icon, label, segment, entries }) => (
                    <div key={segment} className="min-w-0">
                      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                        <Icon className="size-4" aria-hidden="true" />
                        {label}
                      </h3>
                      {entries.slice(0, 5).map((entry) => (
                        <Link
                          key={entry.value}
                          href={`/servers/${segment}/${encodeURIComponent(entry.value)}`}
                          prefetch={false}
                          className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-sm transition-colors hover:bg-muted"
                        >
                          <span className="min-w-0 break-words capitalize">
                            {english && segment === "regions"
                              ? entry.value.replaceAll("-", " ")
                              : entry.label}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {number(entry.count)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="min-w-0 space-y-5">
            {heroSlot ? (
              <HomepagePrimaryPromotion slot={heroSlot} language={language} />
            ) : null}
            {coupons.length > 0 ? (
              <section className="public-panel p-5">
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                  <BadgePercent
                    className="size-5 text-primary"
                    aria-hidden="true"
                  />
                  {english ? "Coupon notebook" : "优惠码速览"}
                </h2>
                <p className="mb-3 text-xs leading-5 text-muted-foreground">
                  {english
                    ? "Check the terms and final price on the provider's checkout page."
                    : "点击查看对应内容，使用前请核对商家活动条件。"}
                </p>
                <div className="divide-y divide-border/60">
                  {coupons.map((offer) => (
                    <CouponLink key={offer.id} offer={offer} />
                  ))}
                </div>
              </section>
            ) : null}
            {editorPicks.length > 0 ? (
              <section className="public-panel p-5">
                <h2 className="text-base font-semibold">
                  {english ? "Editor's picks" : "站长推荐"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {english
                    ? "Latest articles in Editor's Picks"
                    : "站长推荐分类的最新文章"}
                </p>
                {editorPicks.slice(0, 5).map((post, index) => (
                  <ReadingLink
                    key={post.id}
                    post={post}
                    index={index}
                    language={language}
                  />
                ))}
              </section>
            ) : null}
            {sidebarSlots.length > 0 || promotedPosts.length > 0 ? (
              <section className="public-panel p-5">
                <h2 className="mb-4 text-base font-semibold">
                  {english ? "Featured promotions" : "精选推广"}
                </h2>
                {sidebarSlots.length > 0 ? (
                  <HomepageSidebarPromotions slots={sidebarSlots} />
                ) : (
                  promotedPosts
                    .slice(0, 3)
                    .map((post, index) => (
                      <ReadingLink
                        key={post.id}
                        post={post}
                        index={index}
                        language={language}
                      />
                    ))
                )}
              </section>
            ) : null}
            <section className="rounded-xl border border-primary/15 bg-primary/5 p-5">
              <h2 className="text-base font-semibold">
                {english ? "Before you check out" : "下单前，再确认三件事"}
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                {(english
                  ? [
                      "Check the billing period and renewal price.",
                      "Confirm the route and acceptable-use limits.",
                      "Read the refund policy and stock status.",
                    ]
                  : [
                      "核对计费周期与续费价格。",
                      "确认线路、带宽与使用限制。",
                      "了解退款政策和当前库存。",
                    ]
                ).map((text) => (
                  <li key={text} className="flex gap-2">
                    <CircleCheck
                      className="mt-1 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>

        {knowledge.length > 0 ? (
          <section>
            <PublicSectionHeading
              title={
                english
                  ? "Build your infrastructure knowledge"
                  : "把技术知识，变成选购底气"
              }
              eyebrow={english ? "THE KNOWLEDGE LIBRARY" : "知识库新近更新"}
              description={
                english
                  ? "Definitions, practical checks and guidance you can return to."
                  : "概念解释、场景判断与实践建议，遇到问题随时回来查。"
              }
              href={`${prefix}/knowledge`}
              linkLabel={english ? "Visit the library" : "进入知识库"}
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {knowledge.slice(0, 3).map((item) => (
                <KnowledgeCard
                  key={item.id}
                  item={{
                    ...item,
                    categoryName: english
                      ? (item.categoryEnName ?? item.categoryName)
                      : item.categoryName,
                  }}
                  language={language}
                  href={`${prefix}/knowledge/${encodeURIComponent(item.slug)}`}
                  fallbackDefinition={
                    item.summary ??
                    (english
                      ? "Read the complete guide."
                      : "阅读完整知识条目。 ")
                  }
                  viewLabel={english ? "Read guide" : "阅读指南"}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
