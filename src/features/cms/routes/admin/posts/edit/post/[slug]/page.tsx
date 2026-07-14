import {
  getPostBySlug,
  getPostProductionContext,
} from "@/features/cms/data/post";
import EditPost from "@/components/endpoint/edit-post/edit-post";
import { getLeafCategories } from "@/features/shared/data/category";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { contentToArticleMarkdown } from "@fwqgo/core/content";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export default async function EditPostPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  const { slug } = params;
  const { data: post, error } = await getPostBySlug(slug);
  if (error || !post) {
    return (
      <AdminPageShell title="修改文章" description="无法读取要编辑的文章。">
        <AdminSectionCard
          title="文章加载失败"
          description="请确认文章仍然存在，并检查数据库连接或后台日志。"
        >
          <p className="break-words text-sm text-destructive">
            {getErrorMessage(error, `没有找到 slug 为 ${slug} 的文章`)}
          </p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }

  const { data: categories, error: categoriesError } = await getLeafCategories(
    post.language === "en" ? "en" : "zh",
  );
  if (categoriesError || !categories) {
    return (
      <AdminPageShell
        title="修改文章"
        description="文章已读取，但分类选项加载失败。"
      >
        <AdminSectionCard
          title="分类加载失败"
          description="为避免保存到错误分类，当前暂停编辑。请检查分类数据、数据库连接或后台日志。"
        >
          <p className="break-words text-sm text-destructive">
            {getErrorMessage(categoriesError, "没有可用的文章分类")}
          </p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }
  const markdownPost = {
    ...post,
    content: contentToArticleMarkdown(post.content).markdown,
  };
  const productionContext = await getPostProductionContext(post.id).catch(
    (contextError: unknown) => {
      console.error("文章生产上下文加载失败:", contextError);
      return null;
    },
  );

  return (
    <>
      <EditPost
        post={{ post: markdownPost, tags: post.tags }}
        categories={categories}
        postMeta={{
          title: post.title,
          slug,
          language: post.language,
        }}
        productionContext={productionContext}
      />
    </>
  );
}
