import { getPostBySlug } from "@/app/_actions/post";

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
      <article className="prose prose-zinc prose-sm lg:prose col-span-4">
        <h1>{post.title}</h1>
        <main dangerouslySetInnerHTML={{ __html: post.content }} />
      </article>
      <nav className="col-span-1">
        <h2 className="text-lg font-bold">相关文章</h2>
      </nav>
    </div>
  );
}

async function postInfo(slug: string) {
  return await getPostBySlug(slug);
}

export default PostPage;
