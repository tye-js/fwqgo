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
  getProviderOptionsForMonitoring,
} from "@/server/offers/provider-monitor";

async function loadProviderMonitorData() {
  try {
    const [monitors, providers, checks] = await Promise.all([
      getProviderMonitorList(),
      getProviderOptionsForMonitoring(),
      getProviderMonitorCheckHistory(undefined, 80),
    ]);
    return { ok: true as const, monitors, providers, checks };
  } catch (error) {
    console.error("库存监控页面加载失败:", error);
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
        title="库存监控"
        description="配置厂商接口并查看库存检测历史。"
      >
        <AdminSectionCard
          title="库存监控暂时无法读取"
          description="请先确认最新数据库迁移已经执行，再检查 CMS 数据库连接和后台日志。"
        >
          <p className="break-words text-sm text-destructive">
            {result.message}
          </p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }

  const { monitors, providers, checks } = result;
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
      title="库存监控"
      description="配置厂商 JSON 接口，定时同步套餐库存、价格和购买入口。自动更新会尊重套餐里已经锁定的人工字段。"
    >
      <AdminSummaryStrip
        items={[
          {
            label: "监控配置",
            value: String(monitors.length),
            note: `${enabled} 个已启用`,
          },
          {
            label: "映射套餐",
            value: String(mappedOffers),
            note: "已设置厂商产品 ID",
          },
          {
            label: "异常配置",
            value: String(failed),
            note: "最近一次执行失败",
          },
        ]}
      />
      <AdminSectionCard
        title="监控配置与检测记录"
        description="立即执行只会调整当前监控任务的计划时间，不会并发创建相同任务。"
      >
        <ProviderMonitorManager
          monitors={monitors}
          providers={providers}
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
          title="库存监控"
          description="正在加载监控配置和最近检测记录。"
        />
      }
    >
      <ProviderMonitorContent />
    </Suspense>
  );
}
