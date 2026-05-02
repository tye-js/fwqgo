import { getPostBySlug } from "@/app/_actions/post";
import EditPost from "@/components/endpoint/edit-post/edit-post";
import { getLeafCategories } from "@/app/_actions/category";

export default async function EditPostPage(
  props: {
    params: Promise<{ slug: string }>;
  }
) {
  const params = await props.params;
  const { slug } = params;
  const { data: post, error } = await getPostBySlug(slug);
  const { data: categories, error: categoriesError } =
    await getLeafCategories();
  if (categoriesError || !categories) {
    return <div>获取分类失败</div>;
  }
  if (error || !post) {
    return <div>获取文章失败</div>;
  }
  return (
    <>
      <EditPost post={{ post, tags: post.tags }} categories={categories} />
    </>
  );
}
