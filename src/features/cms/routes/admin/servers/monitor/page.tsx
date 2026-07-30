import { Suspense } from "react";
import { connection } from "next/server";

import { AdminLoading } from "@/features/cms/components/admin-loading";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { ProviderMonitorManager } from "@/features/cms/components/provider-monitor-manager";
import { ProviderCatalogScanManager } from "@/features/cms/components/provider-catalog-scan-manager";
import { parsePositiveInt, type SearchParamValue } from "@fwqgo/core/utils";
import {
  getProviderMonitorCheckHistory,
  getProviderMonitorList,
  getProviderMonitorRunHistory,
  getProviderOfferCandidatePage,
  getProviderOptionsForMonitoring,
} from "@/server/offers/provider-monitor";
import { getProviderCatalogScanList } from "@/server/providers/provider-catalog-scan-tasks";

const CANDIDATE_PAGE_SIZE = 50;

type ProviderMonitorSearchParams = {
  candidatePage?: SearchParamValue;
};

async function loadProviderMonitorData(requestedCandidatePage: number) {
  try {
    const [monitors, providers, runs, candidatePage, checks, scans] =
      await Promise.all([
        getProviderMonitorList(),
        getProviderOptionsForMonitoring(),
        getProviderMonitorRunHistory(undefined, 80),
        getProviderOfferCandidatePage(
          "pending",
          requestedCandidatePage,
          CANDIDATE_PAGE_SIZE,
        ),
        getProviderMonitorCheckHistory(undefined, 80),
        getProviderCatalogScanList(100),
      ]);

    return {
      ok: true as const,
      monitors,
      providers,
      runs,
      candidates: candidatePage.candidates,
      candidatePagination: candidatePage.pagination,
      checks,
      scans,
    };
  } catch (error) {
    console.error("供应商采集页面加载失败:", error);
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "未知错误",
    };
  }
}

async function ProviderMonitorContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<ProviderMonitorSearchParams>;
}) {
  await connection();
  const searchParams = await searchParamsPromise;
  const requestedCandidatePage =
    parsePositiveInt(searchParams.candidatePage) ?? 1;
  const result = await loadProviderMonitorData(requestedCandidatePage);

  if (!result.ok) {
    return (
      <AdminPageShell
        badge="服务器套餐"
        title="供应商采集"
        description="供应商官网是套餐配置、价格和购买链接的数据源。"
      >
        <AdminSectionCard
          title="供应商采集暂时无法读取"
          description="请先确认最新数据库迁移已经执行，再检查 CMS 数据库连接和后台日志。"
        >
          <p className="break-words text-sm text-destructive">
            {result.message}
          </p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }

  const {
    monitors,
    providers,
    runs,
    candidates,
    candidatePagination,
    checks,
    scans,
  } = result;
  const activeScanCount = scans.filter(
    (scan) => scan.status === "queued" || scan.status === "running",
  ).length;

  return (
    <AdminPageShell
      badge="服务器套餐"
      title="供应商采集"
      description="管理供应商采集源与待审核套餐；自动发现和运行明细可按需展开。"
    >
      <AdminSectionCard
        title="采集源与套餐审核"
        description="立即采集会进入后台独立队列，同一采集源不会并发运行。"
      >
        <ProviderMonitorManager
          monitors={monitors}
          providers={providers}
          runs={runs}
          candidates={candidates}
          candidatePage={candidatePagination.pageNo}
          candidatePageSize={candidatePagination.pageSize}
          candidateTotalCount={candidatePagination.totalCount}
          candidateTotalPages={candidatePagination.totalPage}
          checks={checks}
        />
      </AdminSectionCard>
      <AdminSectionCard>
        <details
          className="group"
          open={activeScanCount > 0 ? true : undefined}
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                供应商套餐自动发现
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                从供应商公开官网发现套餐目录，并生成可复用的采集源。
              </span>
            </span>
            <span className="shrink-0 text-xs font-medium text-primary">
              {activeScanCount > 0 ? (
                `${activeScanCount} 个任务进行中`
              ) : (
                <>
                  <span className="group-open:hidden">展开</span>
                  <span className="hidden group-open:inline">收起</span>
                </>
              )}
            </span>
          </summary>
          <div className="mt-3 border-t border-border/60 pt-3">
            <ProviderCatalogScanManager providers={providers} scans={scans} />
          </div>
        </details>
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function ProviderMonitorPage(props: {
  searchParams: Promise<ProviderMonitorSearchParams>;
}) {
  return (
    <Suspense
      fallback={
        <AdminLoading
          badge="服务器套餐"
          title="供应商采集"
          description="正在加载采集源、候选套餐和运行记录。"
        />
      }
    >
      <ProviderMonitorContent searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}
