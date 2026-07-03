import { getPostBySlug } from "@/features/cms/data/post";
import EditPost from "@/components/endpoint/edit-post/edit-post";
import { getLeafCategories } from "@/features/shared/data/category";
import { AdminPageShell, AdminSectionCard } from "@/features/cms/components/admin-page-shell";
import { contentToArticleMarkdown } from "@fwqgo/core/content";

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
    return (
      <AdminPageShell title="修改文章" description="文章编辑页">
        <AdminSectionCard>
          <p className="text-sm text-destructive">获取分类失败</p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }
  if (error || !post) {
    return (
      <AdminPageShell title="修改文章" description="文章编辑页">
        <AdminSectionCard>
          <p className="text-sm text-destructive">获取文章失败</p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }
  const markdownPost = {
    ...post,
    content: contentToArticleMarkdown(post.content).markdown,
    enContent: post.enContent
      ? contentToArticleMarkdown(post.enContent).markdown
      : post.enContent,
  };

  return (
    <>
      <EditPost
        post={{ post: markdownPost, tags: post.tags }}
        categories={categories}
        postMeta={{
          title: post.title,
          slug,
        }}
      />
    </>
  );
}
