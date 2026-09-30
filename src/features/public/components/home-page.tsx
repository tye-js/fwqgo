import Link, { PublicAnchor } from "@/features/public/components/public-link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgePercent,
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
    "flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return isInternalHref(href) ? (
    <Link href={href} prefetch={false} className={className}>
      {content}
    </Link>
  ) : isHttpHref(href) ? (
    <PublicAnchor
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {content}
    </PublicAnchor>
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
      className="group flex min-h-11 gap-3 rounded-sm border-b border-border/70 py-3 last:border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

// 地区目录是枚举；用完整地区名，与服务器位置描述区分。
const HOME_REGION_LABELS: Record<string, { zh: string; en: string }> = {
  "hong-kong": { zh: "中国香港", en: "Hong Kong, China" },
  taiwan: { zh: "中国台湾", en: "Taiwan, China" },
};

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
        ["Hong Kong servers", "/servers/hong-kong"],
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
        <div className="public-container grid gap-5 py-6 md:py-7 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-center xl:gap-6">
          <div className="min-w-0">
            <p className="public-kicker">
              {english
                ? "CLOUD INFRASTRUCTURE, MADE CLEAR"
                : "服务器优惠 · 技术阅读 · 理性选购"}
            </p>
            <h1 className="font-editorial mt-2 max-w-3xl break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl xl:text-4xl">
              {english
                ? "Server deals & buying guides"
                : "服务器优惠与选购指南"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {english
                ? "Find the latest offers, read practical guides, and compare your next server."
                : "看最新优惠，读实用指南，比较价格、配置与线路。"}
            </p>
            <div className="mt-4 max-w-2xl">
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
              className="mt-2 flex flex-wrap gap-2"
            >
              {quickLinks.map(([label, href]) => {
                const count = offerCounts.find(
                  (topic) => href === `/servers/${topic.slug}`,
                )?.count;
                return (
                  <Link
                    key={href}
                    href={href}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border/70 bg-card/70 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                  >
                    {label}
                    {count !== undefined ? (
                      <span className="tabular-nums text-foreground">
                        {number(count)}
                        <span className="sr-only">
                          {english ? " offers" : " 个套餐"}
                        </span>
                      </span>
                    ) : (
                      <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
          <aside className="public-panel p-4 xl:p-5">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
              <span>
                {english ? "EXPLORE THE INVENTORY" : "从真实库存开始选购"}
              </span>
              <Server className="size-4 text-primary" aria-hidden="true" />
            </div>
            {totalOfferCount > 0 ? (
              <p className="mt-3 flex flex-wrap items-baseline gap-2">
                <span className="public-stat text-3xl font-semibold">
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

      <div className="public-container space-y-8 py-6 md:space-y-10 md:py-8">
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0" aria-labelledby="home-articles-title">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-3">
              <div>
                <p className="public-kicker mb-1">
                  {english ? "THE JOURNAL" : "持续更新"}
                </p>
                <h2 id="home-articles-title" className="public-section-title">
                  {english ? "Latest articles" : "最新文章"}
                </h2>
              </div>
              <Link
                href={`${prefix}/fwq/page/1`}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                {english ? "All articles" : "全部文章"}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            {lead ? (
              <div className="space-y-4">
                <ArticleCard
                  post={lead}
                  language={language}
                  variant="feature"
                />
                {secondary.length > 0 ? (
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
                    {secondary.map((post) => (
                      <ArticleCard
                        key={post.id}
                        post={post}
                        language={language}
                        variant="compact"
                      />
                    ))}
                  </div>
                ) : null}
                {feed.length > 0 ? (
                  <div className="space-y-4 border-t border-border/70 pt-4">
                    {feed.map((post) => (
                      <ArticleCard
                        key={post.id}
                        post={post}
                        language={language}
                      />
                    ))}
                  </div>
                ) : null}
                <Link
                  href={`${prefix}/fwq/page/1`}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {english ? "Continue to all articles" : "继续浏览全部文章"}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <div className="public-panel p-6">
                <p className="text-base font-semibold">
                  {english
                    ? "New articles are on their way"
                    : "更多文章正在准备中"}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {english
                    ? "Explore the knowledge base and buying tools in the meantime."
                    : "你可以先浏览知识库，或使用选购工具梳理需求。"}
                </p>
                <Link
                  href={`${prefix}/knowledge`}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
                >
                  {english ? "Browse knowledge" : "浏览知识库"}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            )}
          </section>
          <aside className="min-w-0 space-y-5">
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
            {heroSlot ? (
              <HomepagePrimaryPromotion slot={heroSlot} language={language} />
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
            <section className="public-panel p-5">
              <h2 className="mb-2 text-base font-semibold">
                {english ? "Tools & knowledge" : "选购工具与知识"}
              </h2>
              <PublicDiscovery language={language} compact />
            </section>
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

        {promoSlots.length > 0 ? (
          <section>
            <PublicSectionHeading
              title={english ? "In the spotlight" : "特别推荐"}
            />
            <HomepagePromotionGrid slots={promoSlots} />
          </section>
        ) : null}

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

        {collections.regions.length > 0 || collections.providers.length > 0 ? (
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
            <div
              className={`grid gap-6 ${collections.regions.length > 0 && collections.providers.length > 0 ? "sm:grid-cols-2" : ""}`}
            >
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
              ]
                .filter(({ entries }) => entries.length > 0)
                .map(({ icon: Icon, label, segment, entries }) => (
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
                          {segment === "regions"
                            ? (HOME_REGION_LABELS[entry.value]?.[language] ??
                              (english
                                ? entry.value.replaceAll("-", " ")
                                : entry.label))
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
    </main>
  );
}
