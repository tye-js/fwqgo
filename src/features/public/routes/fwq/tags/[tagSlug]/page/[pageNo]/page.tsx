import { getPostsWithTagsByTagSlug, getTagBySlug } from "@/features/public/data/tag";
import { getLatestPostsForSidebar } from "@/features/public/data/post";
import ArticleCard from "@/features/public/components/article-card";
import { LatestPostsSidebar } from "@/features/public/components/latest-posts-sidebar";
import PageCard from "@/features/public/components/page-card";
import { RelatedServerOfferCards } from "@/features/public/components/related-server-offer-cards";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { decodeSlug, parsePositiveInt } from "@fwqgo/core/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { connection } from "next/server";
import { getServerOffersByKeywords } from "@/server/offers/server-offers";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(/\/+$/, "");
}

function splitKeywords(value: string | null | undefined) {
  return (
    value
      ?.split(/[,，、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

export async function generateMetadata(
  props: {
    params: Promise<{ tagSlug: string; pageNo: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const decodedTagSlug = decodeSlug(params.tagSlug);
  const pageNo = parsePositiveInt(params.pageNo) ?? 1;
  const readableName = decodedTagSlug.replace(/[-_]+/g, " ");
  const { data: tag } = await getTagBySlug(decodedTagSlug);
  const title = tag?.name ?? readableName;
  const description =
    tag?.description ?? `${title}相关服务器、VPS、优惠和测评文章。`;
  const canonical = `${getSiteUrl()}/fwq/tags/${encodeURIComponent(decodedTagSlug)}/page/${pageNo}`;
  return {
    title: `${title}-服务器`,
    description,
    keywords: tag?.keywords ?? `${title}的服务器,${title}的VPS`,
    alternates: {
      canonical,
    },
    openGraph: {
      title: `${title}-服务器`,
      description,
      url: canonical,
      siteName: "服务器go",
    },
  };
}

import { Suspense } from "react";

async function TagPageContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ tagSlug: string; pageNo: string }>;
}) {
  await connection();

  const params = await paramsPromise;
  const decodedTagSlug = decodeSlug(params.tagSlug);
  const pageNo = parsePositiveInt(params.pageNo);

  if (!pageNo) {
    notFound();
  }

  const { data: postsWithTag, error } =
    await getPostsWithTagsByTagSlug(
      decodedTagSlug,
      pageNo,
    );
  const [{ data: latestPosts }, relatedOffers] = await Promise.all([
    getLatestPostsForSidebar(),
    getServerOffersByKeywords({
      keywords: [
        postsWithTag?.name ?? decodedTagSlug,
        ...splitKeywords(postsWithTag?.keywords),
      ],
      limit: 6,
    }),
  ]);
  if (error || !postsWithTag?.posts)
    return (
      <div>
        查询<span className="text-red-600">{params.tagSlug}</span>相关的文章失败
      </div>
    );
  const cardInfo = {
    kind: "标签页",
    name: postsWithTag.name,
    description:
      postsWithTag.description ??
      `${postsWithTag.name}的服务器,${postsWithTag.name}的VPS`,
    totalCount: postsWithTag.totalCount ?? 0,
    pageNo: postsWithTag.pageNo,
  };
  const posts = postsWithTag.posts;
  const totalPage = Math.ceil((postsWithTag.totalCount ?? 0) / 10);

  if ((postsWithTag.totalCount ?? 0) > 0 && postsWithTag.pageNo > totalPage) {
    notFound();
  }
  const pageUrl = `${getSiteUrl()}/fwq/tags/${encodeURIComponent(decodedTagSlug)}/page/${postsWithTag.pageNo}`;
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: cardInfo.name,
    description: cardInfo.description,
    url: pageUrl,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: posts.length,
      itemListElement: posts.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${getSiteUrl()}/fwq/posts/${encodeURIComponent(item.post.slug)}`,
        name: item.post.title,
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
        {postsWithTag && <PageCard {...cardInfo} />}
        <RelatedServerOfferCards
          title={`${postsWithTag.name}相关套餐`}
          offers={relatedOffers}
        />
        <div className="space-y-4">
          {posts.length > 0 ? (
            posts.map((post) => <ArticleCard key={post.post.id} post={post.post} />)
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              当前标签下还没有已发布文章。
            </div>
          )}
        </div>
        <PaginationComponent
          pageNo={postsWithTag.pageNo}
          totalPage={totalPage}
          basePath={`/fwq/tags/${params.tagSlug}`}
        />
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-24 space-y-4">
          <Card className="rounded-lg border-border/70 bg-background shadow-none">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Hash className="size-4 text-accent" />
                标签说明
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                标签页更适合跨分类浏览同一主题下的内容，适合连续阅读评测、优惠和线路文章。
              </p>
              <Badge variant="secondary">
                当前第 {postsWithTag.pageNo} / {Math.max(totalPage, 1)} 页
              </Badge>
            </CardContent>
          </Card>

          <LatestPostsSidebar posts={latestPosts ?? []} />
        </div>
      </aside>
    </div>
  );
}

export default function TagPage(
  props: { params: Promise<{ tagSlug: string; pageNo: string }> }
) {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
          正在加载标签文章...
        </div>
      }
    >
      <TagPageContent paramsPromise={props.params} />
    </Suspense>
  );
}
