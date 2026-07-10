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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

async function loadServerOfferManageData() {
  try {
    const [counts, offers] = await Promise.all([
      getServerOfferTopicCounts(),
      getAdminServerOffers(300),
    ]);

    return { counts, offers, error: null };
  } catch (error) {
    console.error("套餐管理页加载套餐数据失败:", error);
    return {
      counts: [] as Awaited<ReturnType<typeof getServerOfferTopicCounts>>,
      offers: [] as Awaited<ReturnType<typeof getAdminServerOffers>>,
      error: getErrorMessage(error),
    };
  }
}

async function ServerOfferManageContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<ServerOfferManageSearchParams>;
}) {
  await connection();

  const searchParams = await searchParamsPromise;
  const { counts, offers, error: loadError } =
    await loadServerOfferManageData();
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  const hasMissingPrice = (priceAmount: unknown) =>
    priceAmount === null || priceAmount === undefined || priceAmount === "";
  const hasMissingSpecs = (
    offer: Awaited<ReturnType<typeof getAdminServerOffers>>[number],
  ) =>
    [
      offer.cpu,
      offer.memory,
      offer.storage,
      offer.bandwidth,
      offer.traffic,
    ].filter((value) => Boolean(value?.trim())).length < 2;
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
      label: "缺配置",
      value: offers.filter(hasMissingSpecs).length,
      note: "至少应有两项 CPU/内存/硬盘/带宽/流量",
    },
    {
      label: "缺购买链接",
      value: offers.filter((offer) => !offer.purchaseUrl?.trim()).length,
      note: "不能形成可购买入口",
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
  ];

  return (
    <AdminPageShell
      badge="服务器套餐"
      title="人工修正数据"
      description="编辑自动提取出的 CPU、内存、硬盘、带宽、流量、价格、来源文章、购买链接和后续测评文章。隐藏的套餐不会出现在前台。"
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
      {loadError ? (
        <AdminSectionCard
          title="套餐数据加载失败"
          description="无法读取套餐列表或专题计数，暂时不能进行人工校正。请检查数据库连接、迁移状态或后台日志。"
        >
          <p className="break-words text-sm text-destructive">{loadError}</p>
        </AdminSectionCard>
      ) : null}
      <div id="quality" className="scroll-mt-24">
        <AdminSectionCard
          title="数据质量检查"
          description="快速查看结构化套餐里最影响前台展示、比价和购买转化的问题。"
        >
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
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
