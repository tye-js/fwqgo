import { getCategoryBySlug } from "@/app/_actions/category";
import {
  getPostsWithTagsByCategoryId,
  getLatestPostsForSidebar,
  getPublishedPostCountByCategoryId,
} from "@/app/_actions/post";
import ArticleCard from "@/app/_components/article-card";
import PageCard from "@/app/_components/page-card";
import { PaginationComponent } from "@/app/_components/pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Compass, Newspaper } from "lucide-react";

export async function generateMetadata(
  props: {
    params: Promise<{ category: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
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
  if (!category) return <div>加载中...</div>;
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
  if (!posts) return <div>加载中...</div>;
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,0.82fr)_320px]">
      <div className="space-y-5">
        {category && <PageCard {...categoryInfo} />}
        <div className="space-y-4">
          {posts.length > 0 ? (
            posts.map((post) => <ArticleCard key={post.id} post={post} />)
          ) : (
            <div className="rounded-[26px] border border-dashed border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
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
          <Card className="rounded-[26px] border-border/70 bg-background/90 shadow-none">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Compass className="size-4 text-accent" />
                浏览建议
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                这一页适合用来系统浏览某个明确分类下的文章，优先看前几篇，再按分页继续深入。
              </p>
              <Badge variant="secondary">当前第 {pageNo} / {Math.max(totalPage, 1)} 页</Badge>
            </CardContent>
          </Card>

          {latestPosts && latestPosts.length > 0 ? (
            <Card className="rounded-[26px] border-border/70 bg-background/90 shadow-none">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Newspaper className="size-4 text-accent" />
                  最新文章
                </div>
                {latestPosts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/fwq/posts/${post.slug}`}
                    className="group flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 transition-colors hover:border-accent/30 hover:bg-accent/5"
                  >
                    <p className="line-clamp-2 text-sm font-medium leading-6 text-foreground transition-colors group-hover:text-accent">
                      {post.title}
                    </p>
                    <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
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
