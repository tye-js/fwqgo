import { Suspense } from "react";
import { connection } from "next/server";

import { AdminLoading } from "@/features/cms/components/admin-loading";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import { ProviderMonitorManager } from "@/features/cms/components/provider-monitor-manager";
import {
  getProviderMonitorCheckHistory,
  getProviderMonitorList,
  getProviderMonitorRunHistory,
  getProviderOfferCandidateList,
  getProviderOptionsForMonitoring,
} from "@/server/offers/provider-monitor";

async function loadProviderMonitorData() {
  try {
    const [monitors, providers, runs, candidates, checks] = await Promise.all([
      getProviderMonitorList(),
      getProviderOptionsForMonitoring(),
      getProviderMonitorRunHistory(undefined, 80),
      getProviderOfferCandidateList("pending", 100),
      getProviderMonitorCheckHistory(undefined, 80),
    ]);
    return { ok: true as const, monitors, providers, runs, candidates, checks };
  } catch (error) {
    console.error("供应商采集页面加载失败:", error);
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "未知错误",
    };
  }
}

async function ProviderMonitorContent() {
  await connection();
  const result = await loadProviderMonitorData();

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

  const { monitors, providers, runs, candidates, checks } = result;
  const enabled = monitors.filter((monitor) => monitor.enabled).length;
  const failed = monitors.filter(
    (monitor) => monitor.lastStatus === "failed",
  ).length;
  const mappedOffers = monitors.reduce(
    (sum, monitor) => sum + Number(monitor.mappedOfferCount ?? 0),
    0,
  );

  return (
    <AdminPageShell
      badge="服务器套餐"
      title="供应商采集"
      description="直接从供应商 JSON、HTML 或 WHMCS 产品页采集具体配置、价格和购买链接；新套餐先审核，文章只作为后续测评或提及关系。"
    >
      <AdminSummaryStrip
        items={[
          {
            label: "采集源",
            value: String(monitors.length),
            note: `${enabled} 个已启用`,
          },
          {
            label: "已采集套餐",
            value: String(mappedOffers),
            note: `${candidates.length} 个候选待审核`,
          },
          {
            label: "异常配置",
            value: String(failed),
            note: "最近一次执行失败",
          },
        ]}
      />
      <AdminSectionCard
        title="采集源、审核与运行记录"
        description="预览不会写入数据；立即采集会进入后台独立队列，同一采集源不会并发运行。"
      >
        <ProviderMonitorManager
          monitors={monitors}
          providers={providers}
          runs={runs}
          candidates={candidates}
          checks={checks}
        />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function ProviderMonitorPage() {
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
      <ProviderMonitorContent />
    </Suspense>
  );
}
