import { Suspense } from "react";
import {
  getAffProviderCount,
  getAffProviderList,
} from "@/features/cms/actions/aff-provider";
import { AdminLoading } from "@/features/cms/components/admin-loading";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import AffManTable from "@/features/cms/components/affman-tables";
import { PaginationComponent } from "@/features/shared/components/pagination";
import {
  boundOffsetPaginationByTotal,
  normalizeOffsetPagination,
} from "@fwqgo/core/pagination";
import { parsePositiveInt } from "@fwqgo/core/utils";
import {
  AdminSectionNav,
  linkManagementNavItems,
} from "@/features/cms/components/admin-section-nav";

function parsePageNo(value: string | undefined) {
  return parsePositiveInt(value) ?? 1;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

async function AffManList({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{
    pageNo?: string;
    query?: string;
    filter?: string;
    sort?: string;
  }>;
}) {
  const searchParams = await searchParamsPromise;
  const requestedPageNo = parsePageNo(searchParams.pageNo);
  const query = searchParams.query?.trim().slice(0, 160) ?? "";
  const filter = ["all", "with-aff", "empty-aff"].includes(
    searchParams.filter ?? "",
  )
    ? searchParams.filter!
    : "all";
  const sort = ["id-desc", "id-asc", "name-asc", "officialUrl-asc"].includes(
    searchParams.sort ?? "",
  )
    ? searchParams.sort!
    : "id-desc";
  const countResult = await getAffProviderCount({ query, filter })
    .then((result) => ({ data: result.data ?? 0, error: null }))
    .catch((error: unknown) => {
      console.error("返利商家管理页计数加载失败:", error);
      return { data: 0, error: getErrorMessage(error) };
    });
  const pagination = boundOffsetPaginationByTotal(
    normalizeOffsetPagination({ pageNo: requestedPageNo, pageSize: 20 }),
    countResult.data,
  );
  const listResult = await getAffProviderList({
    page: pagination.pageNo,
    pageSize: pagination.pageSize,
    query,
    filter,
    sort,
  })
    .then((result) => ({ data: result.data ?? [], error: null }))
    .catch((error: unknown) => {
      console.error("返利商家管理页列表加载失败:", error);
      return { data: [], error: getErrorMessage(error) };
    });
  const loadError = listResult.error ?? countResult.error;

  return (
    <AdminPageShell badge="采集配置" title="返利商家管理">
      <AdminSectionNav
        label="链接管理"
        currentHref="/collect/aff-man"
        items={linkManagementNavItems}
      />
      {loadError ? (
        <AdminSectionCard
          title="返利商家列表加载失败"
          description="无法读取返利规则或分页数量。请检查数据库连接、迁移状态或后台日志后再操作。"
        >
          <p className="break-words text-sm text-destructive">{loadError}</p>
        </AdminSectionCard>
      ) : null}
      <AdminSectionCard>
        <AffManTable
          key={`${pagination.pageNo}-${query}-${filter}-${sort}`}
          data={listResult.data}
          initialQuery={query}
          initialFilter={filter}
          initialSort={sort}
        />
        <PaginationComponent
          pageNo={pagination.pageNo}
          totalPage={pagination.totalPage}
        />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function AffManPage(props: {
  searchParams: Promise<{
    pageNo?: string;
    query?: string;
    filter?: string;
    sort?: string;
  }>;
}) {
  return (
    <Suspense
      fallback={
        <AdminLoading
          badge="采集配置"
          title="正在加载返利商家"
          description="正在读取返利规则和分页数据。"
        />
      }
    >
      <AffManList searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}
