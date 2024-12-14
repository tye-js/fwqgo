import { getPostsWithTagsByTagSlug, getTagBySlug } from "@/app/_actions/tag";
import ArticleCard from "@/app/_components/article-card";
import PageCard from "@/app/_components/page-card";
import { Input } from "@/components/ui/input";
import { decodeSlug } from "@/lib/utils";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: { tagSlug: string };
}): Promise<Metadata> {
  const decodedTagSlug = decodeSlug(params.tagSlug);
  const { data: tag, error } = await getTagBySlug(decodedTagSlug);
  if (error || !tag)
    return {
      title: "服务器go",
      description: "查看所有服务器相关的文章",
    };
  return {
    title: `${tag.name}-服务器`,
    description: tag.description ?? `${tag.name}`,
    keywords: tag.keywords ?? `${tag.name}`,
  };
}

async function TagPage({ params }: { params: { tagSlug: string } }) {
  const decodedTagSlug = decodeSlug(params.tagSlug);
  const { data: postsWithTag, error } =
    await getPostsWithTagsByTagSlug(decodedTagSlug);
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
        <div className="flex flex-col gap-2 lg:gap-4">
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
