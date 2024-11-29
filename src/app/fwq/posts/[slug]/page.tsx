import { getPostWithTagsBySlug, getPostBySlug } from "@/app/_actions/post";

import { decodeSlug, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import type { Metadata } from "next";
import { TableOfContents } from "@/components/toc/table-of-contents";
import { Clock, Eye, Tags } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const decodedSlug = decodeSlug(params.slug);
  const { data: post, error } = await postInfo(decodedSlug);
  if (error || !post)
    return {
      title: "服务器go",
      description: "查看所有服务器相关的文章",
    };
  return {
    title: post.title,
    description: post.description!,
    keywords: post.keywords!,
  };
}

async function PostPage({ params }: { params: { slug: string } }) {
  const decodedSlug = decodeSlug(params.slug);
  const { data, error } = await getPostWithTagsBySlug(decodedSlug);
  if (error) return <div>加载失败: {error}</div>;
  if (!data) return <div>加载中...</div>;
  const { post, recommendedPosts } = data;
  if (!post) return <div>加载中...</div>;
  return (
    <div className="mt-4 grid grid-cols-8 gap-2 lg:gap-6">
      <aside className="col-span-2 hidden lg:block">
        <div className="sticky top-[84px]">
          <TableOfContents content={post.content} />
        </div>
      </aside>
      <article className="prose-sm col-span-5 dark:prose-invert lg:prose prose-h1:text-2xl prose-h1:font-medium prose-a:text-blue-600 prose-a:no-underline">
        <h1>{post.title}</h1>
        <div className="flex justify-center gap-4 border-b border-zinc-200 pb-2 text-sm text-zinc-600">
          <div className="flex items-center gap-1">
            <Clock className="size-4" />
            {formatDate(post.createdAt)}
          </div>
          <div className="flex items-center gap-1">
            <Eye className="size-4" />
            {post.views}次浏览
          </div>
          <div className="flex items-center gap-1">
            <Tags className="size-4" />
            分类：
            <Link href={`/fwq/tags/${post.recommendedTagName}/page/1`}>
              {post.recommendedTagName}
            </Link>
          </div>
        </div>
        <main dangerouslySetInnerHTML={{ __html: post.content }} />
        <div className="mt-4 border-t border-zinc-200 pt-4">
          <div className="text-sm text-zinc-600">标签:</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-center">
            {post.tags?.map((tag) => (
              <Badge
                key={tag.tag.id}
                variant="outline"
                className="text-sm hover:text-black"
              >
                <Link href={`/fwq/tags/${tag.tag.slug}/page/1`}>
                  {tag.tag.name}
                </Link>
              </Badge>
            ))}
          </div>
        </div>
        {recommendedPosts && (
          <div className="mt-4 border-t border-zinc-200 pt-4">
            <h3 className="text-lg font-bold">
              推荐文章-{post.recommendedTagName}
            </h3>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {recommendedPosts.map((post) => (
                <Link key={post.id} href={`/fwq/posts/${post.slug}`}>
                  {post.title}
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>

      <nav className="col-span-1">
        {recommendedPosts && (
          <div className="border-t border-zinc-200">
            <h3 className="text-lg font-bold">
              推荐文章-{post.recommendedTagName}
            </h3>
            <div className="flex flex-col space-y-2 text-sm">
              {recommendedPosts.map((post) => (
                <Link key={post.id} href={`/fwq/posts/${post.slug}`}>
                  {post.title}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>
    </div>
  );
}

async function postInfo(slug: string) {
  return await getPostBySlug(slug);
}

export default PostPage;
