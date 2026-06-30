import { getLeafCategoriesAllData } from "@/app/_actions/category";
import { AdminPageShell, AdminSectionCard } from "@/app/_components/admin-page-shell";
import { CategorySeoTable } from "@/app/_components/category-seo-table";
export default async function Page() {
  const { data, error } = await getLeafCategoriesAllData();
  if (error) {
    return <div>获取叶子分类列表失败</div>;
  }

  return (
    <AdminPageShell
      badge="SEO / 分类"
      title="分类 SEO 管理"
      description="校对叶子分类的 description 和 keywords，避免分类页在搜索引擎中信息过于单薄。"
    >
      <AdminSectionCard
        title="叶子分类列表"
        description="编辑后会同步影响分类页 metadata 中的 description 与 keywords。"
      >
        <CategorySeoTable data={data ?? []} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
