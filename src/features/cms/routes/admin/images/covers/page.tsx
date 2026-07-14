import { desc, eq } from "drizzle-orm";

import { requireAdminSession } from "@fwqgo/auth/session";
import { db } from "@fwqgo/db";
import { categories, posts } from "@fwqgo/db/schema";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import { ArticleCoverBatchGenerator } from "@/features/cms/components/article-cover-batch-generator";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Settings2 } from "lucide-react";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

async function loadCoverGenerationPosts() {
  try {
    const data = await db
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

    return { data, error: null };
  } catch (error) {
    console.error("文章封面生成页加载文章失败:", error);
    return { data: [], error: getErrorMessage(error) };
  }
}

export default async function ArticleCoverGenerationPage() {
  await requireAdminSession();

  const { data: postRows, error: loadError } = await loadCoverGenerationPosts();
  const missingCoverCount = postRows.filter((post) => !post.imgUrl).length;
  const draftCount = postRows.filter((post) => !post.published).length;

  return (
    <AdminPageShell
      badge="AI生图"
      title="文章封面生成"
      description="批量选择文章生成封面图，并自动写入文章封面字段。"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/settings/image-generation">
            <Settings2 className="size-4" />
            生图接口配置
          </Link>
        </Button>
      }
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
      {loadError ? (
        <AdminSectionCard
          title="文章列表加载失败"
          description="无法读取最近文章，暂时不能批量生成封面。请检查数据库连接、迁移状态或后台日志。"
        >
          <p className="break-words text-sm text-destructive">{loadError}</p>
        </AdminSectionCard>
      ) : null}
      <ArticleCoverBatchGenerator posts={postRows} />
    </AdminPageShell>
  );
}
