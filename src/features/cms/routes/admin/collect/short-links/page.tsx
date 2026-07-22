import { count, desc, or } from "drizzle-orm";

import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { ShortLinkTable } from "@/features/cms/components/short-link-table";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { ilikeContains } from "@/server/db/search";
import { db } from "@fwqgo/db";
import { outboundLinks } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import {
  boundOffsetPaginationByTotal,
  normalizeOffsetPagination,
} from "@fwqgo/core/pagination";
import { parsePositiveInt } from "@fwqgo/core/utils";
import {
  AdminSectionNav,
  linkManagementNavItems,
} from "@/features/cms/components/admin-section-nav";

const PAGE_SIZE = 20;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

async function loadShortLinks({
  pageNo,
  query,
}: {
  pageNo: number;
  query: string;
}) {
  const searchCondition = query
    ? or(
        ilikeContains(outboundLinks.slug, query),
        ilikeContains(outboundLinks.targetUrl, query),
      )
    : undefined;

  try {
    const [countRow] = await db
      .select({ value: count() })
      .from(outboundLinks)
      .where(searchCondition);
    const requestedPagination = normalizeOffsetPagination({
      pageNo,
      pageSize: PAGE_SIZE,
    });
    const pagination = boundOffsetPaginationByTotal(
      requestedPagination,
      countRow?.value ?? 0,
    );
    const links = await db
      .select({
        id: outboundLinks.id,
        slug: outboundLinks.slug,
        targetUrl: outboundLinks.targetUrl,
        createdAt: outboundLinks.createdAt,
        updatedAt: outboundLinks.updatedAt,
      })
      .from(outboundLinks)
      .where(searchCondition)
      .orderBy(desc(outboundLinks.createdAt), desc(outboundLinks.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize);

    return {
      links,
      totalCount: pagination.totalCount,
      totalPage: pagination.totalPage,
      pageNo: pagination.pageNo,
      error: null,
    };
  } catch (error) {
    console.error("短链管理页加载失败:", error);
    return {
      links: [],
      totalCount: 0,
      totalPage: 0,
      pageNo: 1,
      error: getErrorMessage(error),
    };
  }
}

export default async function ShortLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ pageNo?: string; query?: string }>;
}) {
  await requireAdminSession();

  const params = await searchParams;
  const requestedPageNo = parsePositiveInt(params.pageNo) ?? 1;
  const query = params.query?.trim().slice(0, 200) ?? "";
  const {
    links,
    pageNo,
    totalPage,
    error: loadError,
  } = await loadShortLinks({
    pageNo: requestedPageNo,
    query,
  });

  return (
    <AdminPageShell badge="推广运营" title="短链跳转">
      <AdminSectionNav
        label="链接管理"
        currentHref="/collect/short-links"
        items={linkManagementNavItems}
      />
      {loadError ? (
        <AdminSectionCard
          title="短链列表加载失败"
          description="无法读取短链或分页数量。文章数据不会受影响，请检查数据库连接、迁移状态或后台日志。"
        >
          <p className="break-words text-sm text-destructive">{loadError}</p>
        </AdminSectionCard>
      ) : null}
      <AdminSectionCard>
        <ShortLinkTable
          key={`${pageNo}:${query}`}
          initialQuery={query}
          publicOrigin={process.env.NEXT_PUBLIC_URL?.replace(/\/+$/, "") ?? ""}
          links={links.map((link) => ({
            ...link,
            createdAt: link.createdAt.toISOString(),
            updatedAt: link.updatedAt?.toISOString() ?? null,
          }))}
        />
        <PaginationComponent pageNo={pageNo} totalPage={totalPage} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
