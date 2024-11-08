import { getPostBySlug } from "@/app/_actions/post";

async function PostPage({ params }: { params: { slug: string } }) {
  const { data: post, error } = await getPostBySlug(params.slug);
  if (error) return <div>加载失败: {error}</div>;
  if (!post) return <div>加载中...</div>;
  return (
    <div className="my-8 grid grid-cols-5 gap-6 space-y-4">
      <main className="col-span-4">
        <h1 className="text-2xl font-bold">{post.title}</h1>
        <div dangerouslySetInnerHTML={{ __html: post.content }} />
      </main>
      <nav className="col-span-1">
        <h2 className="text-lg font-bold">相关文章</h2>
      </nav>
    </div>
  );
}

export default PostPage;
