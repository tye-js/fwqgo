import { Suspense } from "react";
import { connection } from "next/server";
import { getAdminTagCount, getAdminTagList } from "@/features/cms/data/tag";
import { AdminPageShell, AdminSectionCard } from "@/features/cms/components/admin-page-shell";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { TagSeoTable } from "@/features/cms/components/tag-seo-table";

function parsePageNo(value: string | undefined) {
  const parsed = value ? Number.parseInt(value, 10) : 1;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

async function TagListWrapper({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ pageNo?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const pageNo = parsePageNo(searchParams.pageNo);
  const { data } = await getAdminTagList({ page: pageNo, pageSize: 20 });
  const { data: tagCount } = await getAdminTagCount();

  if (!data) {
    return <div>获取标签列表失败</div>;
  }

  const totalPage = Math.ceil((tagCount ?? 0) / 20);

  return (
    <AdminPageShell
      badge="SEO / 标签"
      title="标签 SEO 管理"
      description="控制标签聚合页是否进入 sitemap，避免低价值、临时或过细标签稀释收录质量。"
    >
      <AdminSectionCard
        title="标签列表"
        description="适合长尾 SEO 的标签保持收录；临时活动、过细配置和随机标签建议关闭收录。"
      >
        <TagSeoTable tags={data} />
        <PaginationComponent pageNo={pageNo} totalPage={totalPage} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default async function Page(
  props: {
    searchParams: Promise<{ pageNo?: string }>;
  }
) {
  await connection();

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TagListWrapper searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}
