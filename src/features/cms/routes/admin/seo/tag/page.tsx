import { Suspense } from "react";
import { connection } from "next/server";
import { getAdminTagCount, getAdminTagList } from "@/features/cms/data/tag";
import { AdminLoading } from "@/features/cms/components/admin-loading";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { TagSeoTable } from "@/features/cms/components/tag-seo-table";
import { parsePositiveInt } from "@fwqgo/core/utils";

function parsePageNo(value: string | undefined) {
  return parsePositiveInt(value) ?? 1;
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

export default async function Page(props: {
  searchParams: Promise<{ pageNo?: string }>;
}) {
  await connection();

  return (
    <Suspense
      fallback={
        <AdminLoading
          badge="SEO / 标签"
          title="正在加载标签 SEO"
          description="正在读取标签列表和收录状态。"
        />
      }
    >
      <TagListWrapper searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}
