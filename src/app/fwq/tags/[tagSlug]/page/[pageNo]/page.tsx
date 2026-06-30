import { getPostsWithTagsByTagSlug, getTagBySlug } from "@/app/_actions/tag";
import { getLatestPostsForSidebar } from "@/app/_actions/post";
import ArticleCard from "@/app/_components/article-card";
import { LatestPostsSidebar } from "@/app/_components/latest-posts-sidebar";
import PageCard from "@/app/_components/page-card";
import { PaginationComponent } from "@/app/_components/pagination";
import { decodeSlug } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export async function generateMetadata(
  props: {
    params: Promise<{ tagSlug: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const decodedTagSlug = decodeSlug(params.tagSlug);
  const { data: tag, error } = await getTagBySlug(decodedTagSlug);
  if (error || !tag)
    return {
      title: "服务器go",
      description: "查看所有服务器相关的文章",
    };
  return {
    title: `${tag.name}-服务器`,
    description: tag.description ?? `${tag.name}的服务器,${tag.name}的VPS`,
    keywords: tag.keywords ?? `${tag.name}的服务器,${tag.name}的VPS`,
    robots: tag.indexable
      ? undefined
      : {
          index: false,
          follow: true,
        },
  };
}

import { Suspense } from "react";

async function TagPageContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ tagSlug: string; pageNo: string }>;
}) {
  const params = await paramsPromise;
  const decodedTagSlug = decodeSlug(params.tagSlug);
  const { data: postsWithTag, error } =
    await getPostsWithTagsByTagSlug(
      decodedTagSlug,
      Number.parseInt(params.pageNo, 10),
    );
  const { data: latestPosts } = await getLatestPostsForSidebar();
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

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,0.82fr)_320px]">
      <div className="space-y-5">
        {postsWithTag && <PageCard {...cardInfo} />}
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
    <Suspense fallback={<div>Loading...</div>}>
      <TagPageContent paramsPromise={props.params} />
    </Suspense>
  );
}
