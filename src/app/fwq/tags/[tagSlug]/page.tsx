import { getPostsWithTagsByTagSlug, getTagBySlug } from "@/app/_actions/tag";
import ArticleCard from "@/app/_components/article-card";
import PageCard from "@/app/_components/page-card";
import { Input } from "@/components/ui/input";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: { tagSlug: string };
}): Promise<Metadata> {
  const { data: tag, error } = await getTagBySlug(params.tagSlug);
  if (error || !tag)
    return {
      title: "服务器go",
      description: "查看所有服务器相关的文章",
    };
  return {
    title: `${tag.name}-服务器`,
    description: tag.description!,
    keywords: tag.keywords!,
  };
}

async function TagPage({ params }: { params: { tagSlug: string } }) {
  const { data: postsWithTag, error } = await getPostsWithTagsByTagSlug(
    params.tagSlug,
  );
  if (error || !postsWithTag?.posts)
    return (
      <div>
        查询<span className="text-red-600">{params.tagSlug}</span>相关的文章失败
      </div>
    );
  const cardInfo = {
    name: postsWithTag.name,
    description: postsWithTag.description!,
  };
  const posts = postsWithTag.posts;
  return (
    <div className="mt-2 grid grid-cols-6 gap-8">
      <div className="col-span-4 space-y-4">
        {postsWithTag && <PageCard {...cardInfo} />}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <ArticleCard key={post.post.id} post={post.post} />
          ))}
        </div>
      </div>
      <div className="col-span-2">
        <Input placeholder="搜索" />
      </div>
    </div>
  );
}

export default TagPage;
