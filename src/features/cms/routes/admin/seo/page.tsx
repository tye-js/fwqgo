import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { SiteSeoConfigTable } from "@/features/cms/components/site-seo-config-table";
import { getSiteSeoConfigs } from "@/features/shared/data/site-seo";
import {
  AdminSectionNav,
  seoManagementNavItems,
} from "@/features/cms/components/admin-section-nav";

export default async function Page() {
  const siteResult = await getSiteSeoConfigs().catch((error: unknown) => {
    console.error("主页 SEO 管理页加载失败:", error);
    return {
      data: [],
      error: error instanceof Error ? error.message : "站点 SEO 数据加载失败",
    };
  });
  const siteError = "error" in siteResult ? siteResult.error : null;
  const configs = siteResult.data ?? [];

  return (
    <AdminPageShell
      badge="SEO / 主页"
      title="主页 SEO 管理"
    >
      <AdminSectionNav
        label="SEO 管理"
        currentHref="/seo"
        items={seoManagementNavItems}
      />
      {siteError ? (
        <AdminSectionCard
          title="主页 SEO 数据加载失败"
          description="无法读取主页 SEO 配置。请检查数据库连接、迁移状态或后台日志后再操作。"
        >
          <p className="break-words text-sm text-destructive">{siteError}</p>
        </AdminSectionCard>
      ) : null}
      <AdminSectionCard
        title="主页配置"
        description="修改后会更新对应语言首页的 metadata；Description 使用多行编辑，关键词会自动规范化。"
      >
        <SiteSeoConfigTable data={configs} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
