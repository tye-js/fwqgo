import { getPostWithTagsBySlug } from "@/app/_actions/post";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const { data: post, error } = await postInfo(params.slug);
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
  const { data: post, error } = await postInfo(params.slug);
  if (error) return <div>加载失败: {error}</div>;
  if (!post) return <div>加载中...</div>;
  return (
    <div className="my-8 grid grid-cols-5 gap-6 space-y-4">
      <article className="prose-sm col-span-4 dark:prose-invert lg:prose prose-h1:text-2xl prose-h1:font-medium prose-a:text-blue-600 prose-a:no-underline">
        <h1>{post.title}</h1>
        <div className="border-b border-zinc-200 pb-2 text-sm text-zinc-600">
          {formatDate(post.createdAt)}
        </div>
        <main dangerouslySetInnerHTML={{ __html: post.content }} />
        <div className="flex items-center space-x-2">
          {post.tags.slice(0, 5).map((tag) => (
            <Badge key={tag.tag.id} variant="secondary" className="">
              <Link href={`/fwq/tags/${tag.tag.slug}`}>{tag.tag.name}</Link>
            </Badge>
          ))}
        </div>
      </article>

      <nav className="col-span-1">
        <h2 className="text-lg font-bold">相关文章</h2>
      </nav>
    </div>
  );
}

async function postInfo(slug: string) {
  return await getPostWithTagsBySlug(slug);
}

export default PostPage;
