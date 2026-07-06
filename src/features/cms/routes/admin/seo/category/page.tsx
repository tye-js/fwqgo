import { CategorySeoTable } from "@/features/cms/components/category-seo-table";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { getLeafCategoriesAllData } from "@/features/shared/data/category";

export default async function Page() {
  const { data, error } = await getLeafCategoriesAllData();
  if (error) {
    return <div>获取叶子分类列表失败</div>;
  }

  return (
    <AdminPageShell
      badge="SEO / 分类"
      title="分类 SEO 管理"
      description="批量维护叶子分类页的中英文 SEO 字段，让分类页 metadata 更符合搜索结果摘要规范。"
    >
      <AdminSectionCard
        title="叶子分类列表"
        description="支持单个编辑、单个 AI 生成和选中批量 AI 生成；生成结果会写入中文 Description、Keywords、英文分类、英文 slug、英文 Description 和英文 Keywords。"
      >
        <CategorySeoTable data={data ?? []} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
