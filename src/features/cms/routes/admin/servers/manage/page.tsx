import { connection } from "next/server";
import { Suspense } from "react";

import { AdminLoading } from "@/features/cms/components/admin-loading";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { ServerOfferAdminTable } from "@/features/cms/components/server-offer-admin-table";
import {
  getAdminServerOffers,
  getServerOfferRelationPostOptions,
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
    const [offerPage, providers, relationPosts] = await Promise.all([
      getAdminServerOffers({
        page: parsePageNo(filters.pageNo),
        pageSize: 20,
        query: filters.query,
        kind: filters.kind,
        status: filters.status,
        reviewStatus: filters.reviewStatus,
        visibility: filters.visibility,
      }),
      getProviderOptionsForMonitoring(),
      getServerOfferRelationPostOptions(),
    ]);

    return { offerPage, providers, relationPosts, error: null };
  } catch (error) {
    console.error("套餐管理页加载套餐数据失败:", error);
    return {
      offerPage: {
        rows: [] as Awaited<ReturnType<typeof getAdminServerOffers>>["rows"],
        total: 0,
        page: 1,
        pageSize: 20,
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
    offerPage,
    providers,
    relationPosts,
    error: loadError,
  } = await loadServerOfferManageData(searchParams);
  const publicOrigin = (
    process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com"
  ).replace(/\/+$/, "");

  return (
    <AdminPageShell
      badge="服务器套餐"
      title="套餐管理"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/servers/monitor">
            <RadioTower className="size-4" />
            供应商采集
          </Link>
        </Button>
      }
    >
      {loadError ? (
        <AdminSectionCard
          title="套餐数据加载失败"
          description="无法读取套餐列表，暂时不能进行人工校正。请检查数据库连接、迁移状态或后台日志。"
        >
          <p className="break-words text-sm text-destructive">{loadError}</p>
        </AdminSectionCard>
      ) : null}
      <AdminSectionCard
          title="套餐校正与文章关系"
          description="对官网采集的结构化套餐做审核、补字段、改状态，并维护测评、提及和优惠文章的多对多关系。"
      >
        <ServerOfferAdminTable
          key={`${offerPage.page}:${searchParams.query ?? ""}:${searchParams.kind ?? "all"}:${searchParams.status ?? "all"}:${searchParams.reviewStatus ?? "all"}:${searchParams.visibility ?? "all"}`}
          offers={offerPage.rows}
          providers={providers}
          relationPosts={relationPosts}
          publicOrigin={publicOrigin}
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
