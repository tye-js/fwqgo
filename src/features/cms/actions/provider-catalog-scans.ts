"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import { defineAdminAction } from "@/features/cms/lib/define-admin-action";
import {
  adminActionFailure,
  adminActionSuccess,
} from "@/lib/admin-action-result";
import {
  getProviderCatalogScanDetail,
  startProviderCatalogScans,
} from "@/server/providers/provider-catalog-scan-tasks";

const startScanSchema = z.object({
  providerIds: z
    .array(postgresIntegerIdSchema)
    .min(1, "请至少选择一个供应商")
    .max(50, "一次最多扫描 50 个供应商")
    .transform((values) => [...new Set(values)]),
});

const scanDetailSchema = z.object({
  scanId: postgresIntegerIdSchema,
});

const startProviderCatalogScansMutation = defineAdminAction({
  action: "provider_catalog_scan.start",
  entityType: "provider_catalog_scan",
  parse: (input: z.input<typeof startScanSchema>) =>
    startScanSchema.parse(input),
  execute: async (input, session) => {
    const scans = await startProviderCatalogScans({
      providerIds: input.providerIds,
      requestedBy: session.userId,
    });
    revalidatePath("/servers/monitor");
    return {
      scans,
      queued: scans.filter((scan) => !scan.reused).length,
      reused: scans.filter((scan) => scan.reused).length,
    };
  },
  successMessage: (result) =>
    result.reused > 0
      ? `已处理 ${result.scans.length} 个供应商，其中 ${result.reused} 个继续现有扫描`
      : `已启动 ${result.queued} 个供应商套餐扫描`,
  errorTitle: "启动供应商套餐扫描失败",
  errorSuggestion: "请确认供应商已配置官网，并检查默认 AI 配置和后台任务状态。",
  entityId: (input) => `batch:${input.providerIds.length}`,
});

export async function startProviderCatalogScansAction(input: {
  providerIds: number[];
}) {
  return startProviderCatalogScansMutation(input);
}

export async function getProviderCatalogScanDetailAction(input: {
  scanId: number;
}) {
  try {
    await requireAdminSession();
    const { scanId } = scanDetailSchema.parse(input);
    const scan = await getProviderCatalogScanDetail(scanId);
    if (!scan) throw new Error("供应商套餐扫描记录不存在");
    return adminActionSuccess(scan);
  } catch (error) {
    return adminActionFailure(error, {
      title: "读取扫描审计详情失败",
      suggestion: "请刷新页面后重试。",
    });
  }
}
