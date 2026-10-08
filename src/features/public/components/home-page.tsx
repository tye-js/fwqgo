import Link from "@/features/public/components/public-link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Cpu,
  Globe2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PostWithTags } from "@/types";
import type {
  getHomepageFallbackPromotions,
  getHomepageSidebarData,
} from "@/features/public/data/post";
import type { HomepageTopics } from "@/features/public/data/homepage-topics";
import ArticleCard from "./article-card";
import { HeroTagSearch } from "./hero-tag-search";
import {
  HomepagePrimaryPromotion,
  HomepagePromotionGrid,
  HomepageSidebarPromotions,
  type ActiveHomepageSlot,
} from "./homepage-promotion-slots";

type SidebarPost = {
  id: number;
  title: string;
  slug: string;
  description: string | null;
};
/** `getHomepageFallbackPromotions` 的返回项，含 imgUrl / views / createdAt。 */
type FallbackPromotion = Awaited<
  ReturnType<typeof getHomepageFallbackPromotions>
>[number];
export type PublicHomePageProps = {
  language?: "zh" | "en";
  posts: PostWithTags[];
  sidebarData: Awaited<ReturnType<typeof getHomepageSidebarData>>["data"];
  /**
   * 「推广」区在没有任何 sidebar 运营位时的兜底文章。
   *
   * 由页面层按需取：存在 sidebar 运营位时这批数据必然被丢弃，不该发起查询。
   */
  promotedPosts: FallbackPromotion[];
  homepageSlots: ActiveHomepageSlot[];
  topics: HomepageTopics;
};

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
          <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {post.description}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function PublicHomePage({
  language = "zh",
  posts,
  sidebarData,
  promotedPosts,
  homepageSlots,
  topics,
}: PublicHomePageProps) {
  const english = language === "en";
  const prefix = english ? "/en" : "";
  // Preserve the query's createdAt DESC, id DESC ordering while preventing
  // repeated IDs from producing duplicate cards or recommendations.
  const seen = new Set<number>();
  const feed = posts
    .filter(({ id }) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, 9);
  const readingIds = new Set(feed.map(({ id }) => id));
  const editorPicks = (sidebarData?.editorPicks ?? [])
    .filter(({ id }) => {
      if (readingIds.has(id)) return false;
      readingIds.add(id);
      return true;
    })
    .slice(0, 3);
  const heroSlot = homepageSlots.find(
    (slot) => slot.placement === "hero_primary",
  );
  const sidebarSlots = homepageSlots.filter(
    (slot) => slot.placement === "sidebar",
  );
  const promoSlots = homepageSlots.filter(
    (slot) => slot.placement === "promo_grid",
  );
  const resources = [
    {
      href: `${prefix}/knowledge`,
      label: english ? "Knowledge base" : "服务器知识库",
      icon: BookOpen,
    },
    {
      href: `${prefix}/tools/server-sizing`,
      label: english ? "Server sizing" : "配置选择工具",
      icon: Cpu,
    },
    {
      href: `${prefix}/tools/network-lines`,
      label: english ? "Network guide" : "线路选择工具",
      icon: Globe2,
    },
  ];

  return (
    <main id="main-content" className="min-w-0 flex-1">
      <section className="public-hero">
        <div className="public-container py-5 sm:py-6">
          <div className="grid items-center gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:gap-6">
            <div className="min-w-0">
              <h1 className="font-editorial break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                {english
                  ? "Server deals & buying guides"
                  : "服务器优惠与选购指南"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {english
                  ? "Read the latest deals and reviews to choose your next server."
                  : "读最新优惠与测评，找到适合自己的服务器。"}
              </p>
            </div>
            {english ? (
              <form
                action="/search"
                method="get"
                className="flex min-w-0 gap-2"
              >
                <input type="hidden" name="lang" value="en" />
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">
                    Search providers, regions, networks or articles
                  </span>
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    name="q"
                    required
                    placeholder="Search providers, regions, articles…"
                    className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <Button type="submit" className="h-11 shrink-0 rounded-lg px-4">
                  Search
                </Button>
              </form>
            ) : (
              <HeroTagSearch compact />
            )}
          </div>
          {topics.regions.length > 0 || topics.lines.length > 0 ? (
            <div className="mt-3 space-y-1" data-testid="home-topics">
              {[
                {
                  key: "regions",
                  label: english ? "By region" : "按地区阅读",
                  items: topics.regions,
                },
                {
                  key: "lines",
                  label: english ? "By network" : "按线路阅读",
                  items: topics.lines,
                },
              ]
                .filter(({ items }) => items.length > 0)
                .map(({ key, label, items }) => (
                  <nav
                    key={key}
                    data-topic-kind={key}
                    aria-label={label}
                    className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
                  >
                    <span className="mr-1 text-xs font-medium text-muted-foreground">
                      {label}
                    </span>
                    {items.map(({ label: topicLabel, href }) => (
                      <Link
                        key={href}
                        href={href}
                        className="inline-flex min-h-11 min-w-11 max-w-full items-center rounded-lg border border-border/70 bg-card/70 px-3 py-1 text-xs font-medium text-foreground transition-colors [overflow-wrap:anywhere] hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {topicLabel}
                      </Link>
                    ))}
                  </nav>
                ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className="public-container space-y-6 py-5 sm:py-6">
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0" aria-labelledby="home-articles-title">
            <h2 id="home-articles-title" className="public-section-title mb-4">
              {english ? "Latest articles" : "最新文章"}
            </h2>
            {feed.length > 0 ? (
              <div
                className="rounded-lg border border-border/70 bg-card p-3 sm:p-5"
                data-testid="home-feed"
              >
                {feed.map((post, index) => (
                  <ArticleCard
                    key={post.id}
                    post={post}
                    language={language}
                    variant="home-list"
                    priority={index === 0}
                  />
                ))}
              </div>
            ) : (
              <div className="public-panel p-5">
                <p className="font-semibold">
                  {english
                    ? "New articles are on their way"
                    : "更多文章正在准备中"}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {english
                    ? "Explore the knowledge base and buying tools in the meantime."
                    : "你可以先浏览知识库，或使用选购工具梳理需求。"}
                </p>
              </div>
            )}
            <Link
              href={`${prefix}/fwq/page/1`}
              className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {english ? "Browse all articles" : "浏览全部文章"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </section>
          <aside className="min-w-0 space-y-5">
            {editorPicks.length > 0 ? (
              <section
                className="public-panel p-5"
                data-testid="home-editor-picks"
              >
                <h2 className="text-base font-semibold">
                  {english ? "Editor's picks" : "站长推荐"}
                </h2>
                {editorPicks.map((post, index) => (
                  <ReadingLink
                    key={post.id}
                    post={post}
                    index={index}
                    language={language}
                  />
                ))}
              </section>
            ) : null}
            <section className="public-panel p-5">
              <h2 className="mb-2 text-base font-semibold">
                {english ? "Tools & knowledge" : "选购工具与知识"}
              </h2>
              <nav aria-label={english ? "Buying resources" : "选购资源"}>
                {resources.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 break-words">{label}</span>
                    <ArrowUpRight
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
              </nav>
              <Link
                href="/servers"
                className="mt-3 flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>
                  {english ? "Server offers (Chinese)" : "查看服务器套餐"}
                </span>
                <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
              </Link>
            </section>
            {heroSlot ? (
              <HomepagePrimaryPromotion slot={heroSlot} language={language} />
            ) : null}
            {sidebarSlots.length > 0 || promotedPosts.length > 0 ? (
              <section
                className="public-panel p-5"
                data-testid="home-sidebar-promotions"
              >
                <h2 className="mb-3 text-base font-semibold">
                  {english ? "Sponsored" : "推广"}
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
          </aside>
        </div>
        {promoSlots.length > 0 ? (
          <section data-testid="home-promotion-grid">
            <h2 className="mb-4 text-base font-semibold">
              {english ? "Sponsored" : "推广"}
            </h2>
            <HomepagePromotionGrid slots={promoSlots} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
