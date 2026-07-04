import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Hash } from "lucide-react";

import { getPostsWithTagsByTagSlug } from "@/features/public/data/tag";
import { getLatestPostsForSidebar } from "@/features/public/data/post";
import ArticleCard from "@/features/public/components/article-card";
import { LatestPostsSidebar } from "@/features/public/components/latest-posts-sidebar";
import PageCard from "@/features/public/components/page-card";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { decodeSlug } from "@fwqgo/core/utils";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(/\/+$/, "");
}

export async function generateMetadata(props: {
  params: Promise<{ tagSlug: string; pageNo: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const decodedTagSlug = decodeSlug(params.tagSlug);
  const currentPage = Number.parseInt(params.pageNo, 10);
  const pageNo = Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1;
  const { data } = await getPostsWithTagsByTagSlug(decodedTagSlug, pageNo, "en");
  const title = data?.name ?? decodedTagSlug.replace(/[-_]+/g, " ");

  return {
    title: `${title} - fwqgo`,
    description:
      data?.description ?? `${title} server deals, VPS reviews, and coupons.`,
    keywords: data?.keywords ?? `${title} VPS,${title} server deals`,
    alternates: {
      canonical: `${getSiteUrl()}/en/fwq/tags/${encodeURIComponent(data?.slug ?? decodedTagSlug)}/page/${pageNo}`,
    },
  };
}

async function TagPageContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ tagSlug: string; pageNo: string }>;
}) {
  await connection();

  const params = await paramsPromise;
  const decodedTagSlug = decodeSlug(params.tagSlug);
  const currentPage = Number.parseInt(params.pageNo, 10);
  const pageNo = Number.isFinite(currentPage) && currentPage > 0 ? currentPage : null;
  if (!pageNo) notFound();

  const [{ data: postsWithTag, error }, { data: latestPosts }] =
    await Promise.all([
      getPostsWithTagsByTagSlug(decodedTagSlug, pageNo, "en"),
      getLatestPostsForSidebar("en"),
    ]);

  if (error || !postsWithTag?.posts) {
    return <div>Failed to load tag articles.</div>;
  }

  const posts = postsWithTag.posts;
  const totalPage = Math.ceil((postsWithTag.totalCount ?? 0) / 10);

  if ((postsWithTag.totalCount ?? 0) > 0 && postsWithTag.pageNo > totalPage) {
    notFound();
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,0.82fr)_320px]">
      <div className="space-y-5">
        <PageCard
          kind="Tag"
          name={postsWithTag.name}
          description={
            postsWithTag.description ??
            `${postsWithTag.name} server deals, VPS reviews, and buying guides.`
          }
          totalCount={postsWithTag.totalCount ?? 0}
          pageNo={postsWithTag.pageNo}
          language="en"
        />
        <div className="space-y-4">
          {posts.length > 0 ? (
            posts.map((post) => (
              <ArticleCard key={post.post.id} post={post.post} language="en" />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              No published English articles for this tag yet.
            </div>
          )}
        </div>
        <PaginationComponent
          pageNo={postsWithTag.pageNo}
          totalPage={totalPage}
          basePath={`/en/fwq/tags/${postsWithTag.slug}`}
        />
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-24 space-y-4">
          <Card className="rounded-lg border-border/70 bg-background shadow-none">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Hash className="size-4 text-accent" />
                Tag notes
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Tag pages group related articles across categories for faster
                comparison and reading.
              </p>
              <Badge variant="secondary">
                Page {postsWithTag.pageNo} / {Math.max(totalPage, 1)}
              </Badge>
            </CardContent>
          </Card>

          <LatestPostsSidebar posts={latestPosts ?? []} language="en" />
        </div>
      </aside>
    </div>
  );
}

export default function EnglishTagPage(props: {
  params: Promise<{ tagSlug: string; pageNo: string }>;
}) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TagPageContent paramsPromise={props.params} />
    </Suspense>
  );
}
