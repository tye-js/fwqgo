import { desc, eq } from "drizzle-orm";

import { requireAdminSession } from "@fwqgo/auth/session";
import { db } from "@fwqgo/db";
import { categories, posts } from "@fwqgo/db/schema";
import { AdminPageShell, AdminSummaryStrip } from "@/features/cms/components/admin-page-shell";
import { ArticleCoverBatchGenerator } from "@/features/cms/components/article-cover-batch-generator";

export default async function ArticleCoverGenerationPage() {
  await requireAdminSession();

  const postRows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      imgUrl: posts.imgUrl,
      published: posts.published,
      updatedAt: posts.updatedAt,
      createdAt: posts.createdAt,
      categoryName: categories.name,
    })
    .from(posts)
    .leftJoin(categories, eq(posts.categoryId, categories.id))
    .orderBy(desc(posts.updatedAt), desc(posts.createdAt))
    .limit(120);
  const missingCoverCount = postRows.filter((post) => !post.imgUrl).length;
  const draftCount = postRows.filter((post) => !post.published).length;

  return (
    <AdminPageShell
      badge="AI生图"
      title="文章封面生成"
      description="批量选择文章生成封面图，并自动写入文章封面字段。"
    >
      <AdminSummaryStrip
        items={[
          {
            label: "文章样本",
            value: postRows.length.toLocaleString("zh-CN"),
            note: "最近更新的文章",
          },
          {
            label: "无封面",
            value: missingCoverCount.toLocaleString("zh-CN"),
            note: "默认优先选择这些文章",
          },
          {
            label: "草稿",
            value: draftCount.toLocaleString("zh-CN"),
            note: "生成后可继续人工编辑",
          },
        ]}
      />
      <ArticleCoverBatchGenerator posts={postRows} />
    </AdminPageShell>
  );
}
