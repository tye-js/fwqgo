import { getPosts } from "@/app/_actions/post";
import { PostList } from "@/app/_components/posts-tables";

export default async function EditPage() {
  const { data: posts, error } = await getPosts({ pageNo: 1, pageSize: 15 });
  if (error || !posts) {
    return <div>获取文章列表失败</div>;
  }
  return (
    <div>
      <PostList posts={posts} />
    </div>
  );
}
