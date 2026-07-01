import { getCategoryBySlug } from "@/features/shared/data/category";
import {
  getPostsWithTagsByCategoryId,
  getLatestPostsForSidebar,
  getPublishedPostCountByCategoryId,
} from "@/features/public/data/post";
import ArticleCard from "@/features/public/components/article-card";
import { LatestPostsSidebar } from "@/features/public/components/latest-posts-sidebar";
import PageCard from "@/features/public/components/page-card";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Compass } from "lucide-react";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(/\/+$/, "");
}

export async function generateMetadata(
  props: {
    params: Promise<{ category: string; pageNo: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const currentPage = Number.parseInt(params.pageNo, 10);
  const pageNo = Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1;
  const { data: category, error } = await CategoryInfo(params.category);
  if (error || !category)
    return {
      title: "服务器go",
      description: "查看所有服务器相关的文章",
    };
  return {
    title: `${category.name}-服务器go`,
    description: category.description ?? `${category.name}`,
    keywords: category.keywords ?? `${category.name}`,
    alternates: {
      canonical: `${getSiteUrl()}/fwq/${encodeURIComponent(category.slug)}/page/${pageNo}`,
    },
  };
}

import { Suspense } from "react";

const CategoryPageContent = async ({
  paramsPromise,
}: {
  paramsPromise: Promise<{ category: string; pageNo: string }>;
}) => {
  const params = await paramsPromise;
  const currentPage = Number.parseInt(params.pageNo, 10);
  const pageNo = Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1;
  const { data: category, error: categoryError } = await CategoryInfo(
    params.category,
  );
  if (categoryError) return <div>加载失败: {categoryError}</div>;
  if (!category) notFound();
  const { data: posts, error: postsError } = await getPostsWithTagsByCategoryId(
    category.id,
    pageNo,
  );
  const { data: totalCount } = await getPublishedPostCountByCategoryId(category.id);
  const { data: latestPosts } = await getLatestPostsForSidebar();
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
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,0.82fr)_320px]">
      <div className="space-y-5">
        {category && <PageCard {...categoryInfo} />}
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

export default function CategoryPage(
  props: {
    params: Promise<{ category: string; pageNo: string }>;
  }
) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CategoryPageContent paramsPromise={props.params} />
    </Suspense>
  );
}
