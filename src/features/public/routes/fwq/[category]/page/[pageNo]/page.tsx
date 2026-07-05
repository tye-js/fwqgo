import { getCategoryBySlug } from "@/features/shared/data/category";
import {
  getPostsWithTagsByCategoryId,
  getLatestPostsForSidebar,
  getPublishedPostCountByCategoryId,
} from "@/features/public/data/post";
import ArticleCard from "@/features/public/components/article-card";
import { LatestPostsSidebar } from "@/features/public/components/latest-posts-sidebar";
import PageCard from "@/features/public/components/page-card";
import { RelatedServerOfferCards } from "@/features/public/components/related-server-offer-cards";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { decodeSlug, parsePositiveInt } from "@fwqgo/core/utils";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Compass } from "lucide-react";
import { connection } from "next/server";
import { getServerOffersByKeywords } from "@/server/offers/server-offers";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

function splitKeywords(value: string | null | undefined) {
  return (
    value
      ?.split(/[,，、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

export async function generateMetadata(props: {
  params: Promise<{ category: string; pageNo: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const pageNo = parsePositiveInt(params.pageNo) ?? 1;
  const decodedCategory = decodeSlug(params.category);
  const readableName = decodedCategory.replace(/[-_]+/g, " ");
  const { data: category } = await getCategoryBySlug(decodedCategory);
  const title = category?.name ?? readableName;
  const description =
    category?.description ?? `${title}相关的服务器优惠、评测与选购文章。`;
  const canonicalSlug = category?.slug ?? decodedCategory;
  const canonical = `${getSiteUrl()}/fwq/${encodeURIComponent(canonicalSlug)}/page/${pageNo}`;
  const englishSlug = category?.enSlug?.trim();
  const englishUrl = englishSlug
    ? `${getSiteUrl()}/en/fwq/${encodeURIComponent(englishSlug)}/page/${pageNo}`
    : undefined;
  return {
    title: `${title}-服务器go`,
    description,
    keywords: category?.keywords ?? readableName,
    alternates: {
      canonical,
      languages: {
        "zh-CN": canonical,
        ...(englishUrl ? { en: englishUrl } : {}),
        "x-default": canonical,
      },
    },
    openGraph: {
      title: `${title}-服务器go`,
      description,
      url: canonical,
      siteName: "服务器go",
    },
  };
}

import { Suspense } from "react";

const CategoryPageContent = async ({
  paramsPromise,
}: {
  paramsPromise: Promise<{ category: string; pageNo: string }>;
}) => {
  await connection();

  const params = await paramsPromise;
  const pageNo = parsePositiveInt(params.pageNo);
  if (!pageNo) {
    notFound();
  }

  const { data: category, error: categoryError } = await CategoryInfo(
    params.category,
  );
  if (categoryError) return <div>加载失败: {categoryError}</div>;
  if (!category) notFound();
  const { data: posts, error: postsError } = await getPostsWithTagsByCategoryId(
    category.id,
    pageNo,
  );
  const { data: totalCount } = await getPublishedPostCountByCategoryId(
    category.id,
  );
  const [{ data: latestPosts }, relatedOffers] = await Promise.all([
    getLatestPostsForSidebar(),
    getServerOffersByKeywords({
      keywords: [category.name, ...splitKeywords(category.keywords)],
      limit: 6,
    }),
  ]);
  const totalPage = Math.ceil((totalCount ?? 0) / 10);

  if ((totalCount ?? 0) > 0 && pageNo > totalPage) {
    notFound();
  }

  const categoryInfo = {
    kind: "分类页",
    name: category.name,
    description:
      category.description ??
      `${category.name}相关的服务器优惠、评测与选购文章聚合页。`,
    totalCount: totalCount ?? 0,
    pageNo,
  };
  if (postsError) return <div>加载失败: {postsError}</div>;
  if (!posts) notFound();
  const pageUrl = `${getSiteUrl()}/fwq/${encodeURIComponent(params.category)}/page/${pageNo}`;
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: categoryInfo.name,
    description: categoryInfo.description,
    url: pageUrl,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: posts.length,
      itemListElement: posts.map((post, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${getSiteUrl()}/fwq/posts/${encodeURIComponent(post.slug)}`,
        name: post.title,
      })),
    },
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,0.82fr)_320px]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <div className="space-y-5">
        {category && <PageCard {...categoryInfo} />}
        <RelatedServerOfferCards
          title={`${category.name}相关套餐`}
          offers={relatedOffers}
        />
        <div className="space-y-4">
          {posts.length > 0 ? (
            posts.map((post) => <ArticleCard key={post.id} post={post} />)
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              当前分类下还没有已发布文章。
            </div>
          )}
        </div>
        <PaginationComponent
          pageNo={pageNo}
          totalPage={totalPage}
          basePath={`/fwq/${params.category}`}
        />
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-24 space-y-4">
          <Card className="rounded-lg border-border/70 bg-background shadow-none">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Compass className="size-4 text-accent" />
                浏览建议
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                这一页适合用来系统浏览某个明确分类下的文章，优先看前几篇，再按分页继续深入。
              </p>
              <Badge variant="secondary">
                当前第 {pageNo} / {Math.max(totalPage, 1)} 页
              </Badge>
            </CardContent>
          </Card>

          <LatestPostsSidebar posts={latestPosts ?? []} />
        </div>
      </aside>
    </div>
  );
};

async function CategoryInfo(slug: string) {
  return await getCategoryBySlug(slug);
}

export default function CategoryPage(props: {
  params: Promise<{ category: string; pageNo: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
          正在加载分类文章...
        </div>
      }
    >
      <CategoryPageContent paramsPromise={props.params} />
    </Suspense>
  );
}
