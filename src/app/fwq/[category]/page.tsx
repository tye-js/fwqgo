import React from "react";

import { Input } from "@/components/ui/input";
import { getCategoryBySlug } from "@/app/_actions/category";
import { getPostsWithTagsByCategoryId } from "@/app/_actions/post";
import ArticleCard from "@/app/_components/article-card";
import PageCard from "@/app/_components/page-card";

import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: { category: string };
}): Promise<Metadata> {
  const { data: category, error } = await CategoryInfo(params.category);
  if (error || !category)
    return {
      title: "服务器go",
      description: "查看所有服务器相关的文章",
    };
  return {
    title: `${category.name}-服务器go`,
    description: category.description!,
    keywords: category.keywords!,
  };
}

const CategoryPage = async ({ params }: { params: { category: string } }) => {
  const { data: category, error: categoryError } = await CategoryInfo(
    params.category,
  );
  if (categoryError) return <div>加载失败: {categoryError}</div>;
  if (!category) return <div>加载中...</div>;
  const { data: posts, error: postsError } = await getPostsWithTagsByCategoryId(
    category.id,
  );
  const categoryInfo = {
    name: category.name,
    description: category.description!,
  };
  if (postsError) return <div>加载失败: {postsError}</div>;
  if (!posts) return <div>加载中...</div>;
  return (
    <div className="mt-2 grid grid-cols-6 gap-8">
      <div className="col-span-4 space-y-4">
        {category && <PageCard {...categoryInfo} />}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <ArticleCard key={post.id} post={post} />
          ))}
        </div>
      </div>
      <div className="col-span-2">
        <div className="grid grid-cols-6 items-center gap-2">
          <label htmlFor="search" className="col-span-1 text-sm">
            搜索
          </label>
          <Input id="search" placeholder="搜索" className="col-span-4" />
        </div>
      </div>
    </div>
  );
};

async function CategoryInfo(slug: string) {
  return await getCategoryBySlug(slug);

  // ... rest of the component remains the same ...
}

export default CategoryPage;
