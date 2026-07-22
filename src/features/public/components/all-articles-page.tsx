import { connection } from "next/server";
import { notFound } from "next/navigation";

import ArticleCard from "@/features/public/components/article-card";
import { LatestPostsSidebar } from "@/features/public/components/latest-posts-sidebar";
import PageCard from "@/features/public/components/page-card";
import {
  getLatestPostsForSidebar,
  getPublishedPostCount,
  getPublishedPostsPage,
} from "@/features/public/data/post";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { jsonLdScriptContent, parsePositiveInt } from "@fwqgo/core/utils";

type PublicLanguage = "zh" | "en";

const pageCopy = {
  zh: {
    kind: "文章归档",
    title: "全部文章",
    description: "按发布时间浏览全部服务器优惠、测评和选购指南。",
    error: "文章列表暂时无法读取。",
    empty: "暂时没有已发布文章。",
  },
  en: {
    kind: "Article archive",
    title: "All Articles",
    description:
      "Browse all published server deals, reviews, and buying guides by date.",
    error: "The article list is temporarily unavailable.",
    empty: "No published articles yet.",
  },
} satisfies Record<
  PublicLanguage,
  {
    kind: string;
    title: string;
    description: string;
    error: string;
    empty: string;
  }
>;

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

export async function AllArticlesPageContent({
  paramsPromise,
  language = "zh",
}: {
  paramsPromise: Promise<{ pageNo: string }>;
  language?: PublicLanguage;
}) {
  await connection();

  const params = await paramsPromise;
  const pageNo = parsePositiveInt(params.pageNo);
  if (!pageNo) notFound();

  const [{ data: totalCount }, { data: latestPosts }] = await Promise.all([
    getPublishedPostCount(language),
    getLatestPostsForSidebar(language),
  ]);
  const totalPage = Math.ceil((totalCount ?? 0) / 10);

  if (pageNo > Math.max(totalPage, 1)) notFound();

  const { data: articles, error } = await getPublishedPostsPage(
    pageNo,
    language,
  );

  const copy = pageCopy[language];
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {copy.error}
      </div>
    );
  }
  if (!articles) notFound();

  const basePath = language === "en" ? "/en/fwq" : "/fwq";
  const articlePath = language === "en" ? "/en/fwq/posts" : "/fwq/posts";
  const pageUrl = `${getSiteUrl()}${basePath}/page/${pageNo}`;
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: copy.title,
    description: copy.description,
    url: pageUrl,
    ...(language === "en" ? { inLanguage: "en" } : {}),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: articles.length,
      itemListElement: articles.map((article, index) => ({
        "@type": "ListItem",
        position: (pageNo - 1) * 10 + index + 1,
        url: `${getSiteUrl()}${articlePath}/${encodeURIComponent(article.slug)}`,
        name: article.title,
      })),
    },
  };

  return (
    <div className="grid gap-8 px-4 xl:grid-cols-[minmax(0,0.82fr)_320px]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScriptContent(collectionJsonLd),
        }}
      />
      <div className="space-y-5">
        <PageCard
          kind={copy.kind}
          name={copy.title}
          description={copy.description}
          totalCount={totalCount ?? 0}
          pageNo={pageNo}
          language={language}
          variant="compact"
        />
        <div className="space-y-4">
          {articles.length > 0 ? (
            articles.map((article) => (
              <ArticleCard
                key={article.id}
                post={article}
                language={language}
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              {copy.empty}
            </div>
          )}
        </div>
        <PaginationComponent
          pageNo={pageNo}
          totalPage={totalPage}
          basePath={basePath}
        />
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-24">
          <LatestPostsSidebar posts={latestPosts ?? []} language={language} />
        </div>
      </aside>
    </div>
  );
}
