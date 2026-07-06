import { getAdminTagCount, getAdminTagList } from "@/features/cms/data/tag";
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

export default async function Page(props: {
  searchParams: Promise<{ pageNo?: string }>;
}) {
  const searchParams = await props.searchParams;
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
      description="批量维护标签聚合页的中英文 SEO 字段，价格、优惠、折扣类标签默认不参与运营。"
    >
      <AdminSectionCard
        title="标签列表"
        description="支持单个编辑、单个 AI 生成和选中批量 AI 生成；生成结果会写入中文 Description、Keywords、英文标签、英文 slug、英文 Description 和英文 Keywords。"
      >
        <TagSeoTable key={pageNo} tags={data} />
        <PaginationComponent pageNo={pageNo} totalPage={totalPage} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
