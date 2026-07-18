import { CategorySeoTable } from "@/features/cms/components/category-seo-table";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { getLeafCategoriesAllData } from "@/features/shared/data/category";
import {
  AdminSectionNav,
  seoManagementNavItems,
} from "@/features/cms/components/admin-section-nav";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

export default async function Page() {
  const result = await getLeafCategoriesAllData().catch((error: unknown) => {
    console.error("分类 SEO 管理页加载失败:", error);
    return { data: [], error: getErrorMessage(error) };
  });
  const data = result.data ?? [];
  const loadError = result.error ? getErrorMessage(result.error) : null;

  return (
    <AdminPageShell
      badge="SEO / 分类"
      title="分类 SEO 管理"
    >
      <AdminSectionNav
        label="SEO 管理"
        currentHref="/seo/category"
        items={seoManagementNavItems}
      />
      {loadError ? (
        <AdminSectionCard
          title="分类列表加载失败"
          description="无法读取分类 SEO 数据，暂时不能批量生成或编辑。请检查数据库连接、迁移状态或后台日志。"
        >
          <p className="break-words text-sm text-destructive">{loadError}</p>
        </AdminSectionCard>
      ) : null}
      <AdminSectionCard
        title="叶子分类列表"
        description="支持单个编辑、单个 AI 生成和选中批量 AI 生成；生成结果会写入中文 Description、Keywords、英文分类、英文 slug、英文 Description 和英文 Keywords。"
      >
        <CategorySeoTable data={data} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
