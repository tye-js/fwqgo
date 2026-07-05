import { connection } from "next/server";
import { Suspense } from "react";

import { AdminLoading } from "@/features/cms/components/admin-loading";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import { ServerOfferAdminTable } from "@/features/cms/components/server-offer-admin-table";
import {
  getAdminServerOffers,
  getServerOfferTopicCounts,
} from "@/server/offers/server-offers";
import { parsePositiveInt } from "@fwqgo/core/utils";

type ServerOfferManageSearchParams = {
  pageNo?: string;
  query?: string;
  status?: string;
  reviewStatus?: string;
  visibility?: string;
};

function parsePageNo(value: string | undefined) {
  return parsePositiveInt(value) ?? 1;
}

async function ServerOfferManageContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<ServerOfferManageSearchParams>;
}) {
  await connection();

  const searchParams = await searchParamsPromise;
  const [counts, offers] = await Promise.all([
    getServerOfferTopicCounts(),
    getAdminServerOffers(300),
  ]);
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  const hasMissingPrice = (priceAmount: unknown) =>
    priceAmount === null || priceAmount === undefined || priceAmount === "";
  const qualityIssues = [
    {
      label: "待审核",
      value: offers.filter((offer) => offer.reviewStatus === "pending").length,
      note: "需要人工确认字段",
    },
    {
      label: "需修正",
      value: offers.filter((offer) => offer.reviewStatus === "needs_fix")
        .length,
      note: "提取结果可能不完整",
    },
    {
      label: "缺价格",
      value: offers.filter((offer) => hasMissingPrice(offer.priceAmount))
        .length,
      note: "影响前台比价排序",
    },
    {
      label: "缺地区",
      value: offers.filter((offer) => !offer.region).length,
      note: "影响地区专题归类",
    },
    {
      label: "重复/合并",
      value: offers.filter((offer) =>
        ["duplicate", "merged"].includes(offer.reviewStatus),
      ).length,
      note: "需要确认是否隐藏",
    },
  ];

  return (
    <AdminPageShell
      badge="服务器套餐"
      title="人工修正数据"
      description="编辑自动提取出的价格、地区、线路、状态、购买链接和优惠码。隐藏的套餐不会出现在前台。"
    >
      <AdminSummaryStrip
        items={[
          {
            label: "专题命中",
            value: String(total),
            note: "香港、美国、便宜 VPS 的可见套餐合计",
          },
          {
            label: "香港服务器",
            value: String(
              counts.find((item) => item.slug === "hong-kong")?.count ?? 0,
            ),
            note: "地区字段命中香港",
          },
          {
            label: "便宜 VPS",
            value: String(
              counts.find((item) => item.slug === "cheap-vps")?.count ?? 0,
            ),
            note: "月付美元价格不高于 8",
          },
        ]}
      />
      <div id="quality" className="scroll-mt-24">
        <AdminSectionCard
          title="数据质量检查"
          description="快速查看结构化套餐里最影响前台展示和比价体验的问题。"
        >
          <div className="grid gap-3 md:grid-cols-5">
            {qualityIssues.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-border/70 bg-muted/20 p-4"
              >
                <p className="text-xs font-medium text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {item.value}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {item.note}
                </p>
              </div>
            ))}
          </div>
        </AdminSectionCard>
      </div>
      <AdminSectionCard
        title="套餐校正"
        description="对提取后的结构化套餐做人工审核、补字段、改状态和控制前台展示。"
      >
        <ServerOfferAdminTable
          offers={offers}
          initialFilters={{
            pageNo: parsePageNo(searchParams.pageNo),
            query: searchParams.query?.trim() ?? "",
            status: searchParams.status ?? "all",
            reviewStatus: searchParams.reviewStatus ?? "all",
            visibility: searchParams.visibility ?? "all",
          }}
        />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function ServerOfferManagePage(props: {
  searchParams: Promise<ServerOfferManageSearchParams>;
}) {
  return (
    <Suspense
      fallback={
        <AdminLoading
          badge="服务器套餐"
          title="人工修正数据"
          description="正在加载结构化套餐数据。"
        />
      }
    >
      <ServerOfferManageContent searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}
