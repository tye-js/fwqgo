import { getLeafCategoriesAllData } from "@/features/shared/data/category";
import { AdminPageShell, AdminSectionCard } from "@/features/cms/components/admin-page-shell";
import { CategorySeoTable } from "@/features/cms/components/category-seo-table";
import { SiteSeoConfigTable } from "@/features/cms/components/site-seo-config-table";
import { getSiteSeoConfigs } from "@/features/shared/data/site-seo";

export default async function Page() {
  const [{ data, error }, { data: siteSeoConfigs }] = await Promise.all([
    getLeafCategoriesAllData(),
    getSiteSeoConfigs(),
  ]);
  if (error) {
    return <div>获取叶子分类列表失败</div>;
  }

  return (
    <AdminPageShell
      badge="SEO"
      title="SEO 概览"
      description="集中查看当前分类与标签的 SEO 基础数据，方便继续补全和校对。"
    >
      <AdminSectionCard
        title="站点 SEO 配置"
        description="配置中文首页和英文首页的站点名、title、description 与 keywords。"
      >
        <SiteSeoConfigTable data={siteSeoConfigs ?? []} />
      </AdminSectionCard>

      <AdminSectionCard
        title="分类 SEO 速览"
        description="当前列出叶子分类的 slug、description 与 keywords，可直接编辑保存。"
      >
        <CategorySeoTable data={data ?? []} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
