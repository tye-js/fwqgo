import { Suspense } from "react";
import {
  getAffProviderCount,
  getAffProviderList,
} from "@/app/_actions/aff-provider";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/app/_components/admin-page-shell";
import AffManTable from "@/app/_components/affman-tables";
import { PaginationComponent } from "@/app/_components/pagination";

async function AffManList({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ pageNo?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const pageNo = searchParams.pageNo ? parseInt(searchParams.pageNo) : 1;
  const { data } = await getAffProviderList({ page: pageNo });
  const { data: postCount } = await getAffProviderCount();
  const totalPage = Math.ceil((postCount ?? 0) / 20);

  return (
    <AdminPageShell
      badge="采集配置"
      title="返利商家管理"
      description="统一维护返利链接、参数和值，保证采集和出链替换逻辑一致。"
    >
      <AdminSummaryStrip
        items={[
          {
            label: "商家总数",
            value: String(postCount ?? 0),
            note: "返利配置对象",
          },
          {
            label: "当前页",
            value: String(pageNo),
            note: `共 ${Math.max(totalPage, 1)} 页`,
          },
          {
            label: "本页数量",
            value: String(data?.length ?? 0),
            note: "当前页可见商家",
          },
        ]}
      />
      <AdminSectionCard
        title="返利商家列表"
        description="这里的配置会直接影响采集文章中的返利链接替换行为。"
      >
        <AffManTable data={data} />
        <PaginationComponent pageNo={pageNo} totalPage={totalPage} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function AffManPage(
  props: {
    searchParams: Promise<{ pageNo?: string }>;
  }
) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AffManList searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}
