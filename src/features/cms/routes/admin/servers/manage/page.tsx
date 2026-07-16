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
  getAdminServerOfferQualitySummary,
  getAdminServerOffers,
  getServerOfferRelationPostOptions,
  getServerOfferTopicCounts,
} from "@/server/offers/server-offers";
import { parsePositiveInt } from "@fwqgo/core/utils";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RadioTower } from "lucide-react";
import { getProviderOptionsForMonitoring } from "@/server/offers/provider-monitor";

type ServerOfferManageSearchParams = {
  pageNo?: string;
  query?: string;
  kind?: string;
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

async function loadServerOfferManageData(
  filters: ServerOfferManageSearchParams,
) {
  try {
    const [counts, offerPage, quality, providers, relationPosts] = await Promise.all([
      getServerOfferTopicCounts(),
      getAdminServerOffers({
        page: parsePageNo(filters.pageNo),
        pageSize: 20,
        query: filters.query,
        kind: filters.kind,
        status: filters.status,
        reviewStatus: filters.reviewStatus,
        visibility: filters.visibility,
      }),
      getAdminServerOfferQualitySummary(),
      getProviderOptionsForMonitoring(),
      getServerOfferRelationPostOptions(),
    ]);

    return { counts, offerPage, quality, providers, relationPosts, error: null };
  } catch (error) {
    console.error("套餐管理页加载套餐数据失败:", error);
    return {
      counts: [] as Awaited<ReturnType<typeof getServerOfferTopicCounts>>,
      offerPage: {
        rows: [] as Awaited<ReturnType<typeof getAdminServerOffers>>["rows"],
        total: 0,
        page: 1,
        pageSize: 20,
      },
      quality: {
        pending: 0,
        needsFix: 0,
        missingSpecs: 0,
        missingPurchaseUrl: 0,
        missingPrice: 0,
        missingRegion: 0,
        regularCount: 0,
        promotionCount: 0,
      },
      providers: [] as Awaited<ReturnType<typeof getProviderOptionsForMonitoring>>,
      relationPosts: [] as Awaited<ReturnType<typeof getServerOfferRelationPostOptions>>,
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
  const {
    counts,
    offerPage,
    quality,
    providers,
    relationPosts,
    error: loadError,
  } = await loadServerOfferManageData(searchParams);
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  const qualityIssues = [
    {
      label: "待审核",
      value: quality.pending,
      note: "需要人工确认字段",
    },
    {
      label: "需修正",
      value: quality.needsFix,
      note: "提取结果可能不完整",
    },
    {
      label: "缺配置",
      value: quality.missingSpecs,
      note: "至少应有两项 CPU/内存/硬盘/带宽/流量",
    },
    {
      label: "缺购买链接",
      value: quality.missingPurchaseUrl,
      note: "不能形成可购买入口",
    },
    {
      label: "缺价格",
      value: quality.missingPrice,
      note: "影响前台比价排序",
    },
    {
      label: "缺地区",
      value: quality.missingRegion,
      note: "影响地区专题归类",
    },
  ];

  return (
    <AdminPageShell
      badge="服务器套餐"
      title="套餐管理"
      description="供应商官网采集后在这里审核和校正配置、价格、状态、购买链接，并关联多篇测评、提及或优惠文章。"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/servers/monitor">
            <RadioTower className="size-4" />
            供应商采集
          </Link>
        </Button>
      }
    >
      <AdminSummaryStrip
        items={[
          {
            label: "常规款",
            value: String(quality.regularCount),
            note: "供应商目录常规产品",
          },
          {
            label: "活动款",
            value: String(quality.promotionCount),
            note: "供应商促销产品",
          },
          {
            label: "专题命中",
            value: String(total),
            note: "香港、美国、便宜 VPS 的可见套餐合计",
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
          <div className="grid gap-px overflow-hidden rounded-md border border-border/70 bg-border/70 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {qualityIssues.map((item) => (
              <div key={item.label} className="bg-background px-3 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
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
          title="套餐校正与文章关系"
          description="对官网采集的结构化套餐做审核、补字段、改状态，并维护测评、提及和优惠文章的多对多关系。"
      >
        <ServerOfferAdminTable
          key={`${offerPage.page}:${searchParams.query ?? ""}:${searchParams.kind ?? "all"}:${searchParams.status ?? "all"}:${searchParams.reviewStatus ?? "all"}:${searchParams.visibility ?? "all"}`}
          offers={offerPage.rows}
          providers={providers}
          relationPosts={relationPosts}
          totalCount={offerPage.total}
          initialFilters={{
            pageNo: offerPage.page,
            query: searchParams.query?.trim() ?? "",
            kind: searchParams.kind ?? "all",
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
