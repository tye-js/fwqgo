"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { requirePublicHttpUrl } from "@fwqgo/core/network-url";
import {
  parseProviderMonitorConfig,
  PROVIDER_SOURCE_ADAPTERS,
  PROVIDER_SOURCE_PURPOSES,
  type ProviderSourceAdapter,
} from "@fwqgo/core/provider-monitor-config";
import {
  adminActionFailure,
  adminActionSuccess,
} from "@/lib/admin-action-result";
import { defineAdminAction } from "@/features/cms/lib/define-admin-action";
import {
  createProviderMonitor,
  deleteProviderMonitor,
  enqueueProviderMonitorTask,
  getProviderMonitorList,
  previewProviderMonitorSource,
  retryProviderMonitorRun,
  updateProviderMonitor,
} from "@/server/offers/provider-monitor";
import {
  acceptProviderOfferCandidate,
  rejectProviderOfferCandidate,
  reviewProviderOfferCandidates,
} from "@/server/offers/provider-offer-sync";

const monitorInputSchema = z.object({
  id: z.number().int().positive().optional(),
  providerId: z.number().int().positive("请选择厂商"),
  name: z.string().trim().min(1, "请输入采集源名称").max(160),
  adapter: z.enum(PROVIDER_SOURCE_ADAPTERS),
  purpose: z.enum(PROVIDER_SOURCE_PURPOSES),
  endpointUrl: z.string().trim().url("请输入完整的供应商网址"),
  configText: z.string().trim().max(30_000),
  enabled: z.boolean(),
  autoPublish: z.boolean(),
  missingThreshold: z.number().int().min(1).max(20),
  intervalMinutes: z.number().int().min(1).max(10_080),
  timeoutSeconds: z.number().int().min(1).max(300),
});

const candidateReviewSchema = z.object({
  candidateId: z.number().int().positive("候选套餐 ID 无效"),
  decision: z.enum(["accept", "reject"]),
  reason: z.string().trim().max(500, "拒绝原因不能超过 500 个字符").optional(),
});

const candidateBatchReviewSchema = z.object({
  candidateIds: z
    .array(z.number().int().positive())
    .min(1, "请至少选择一个候选套餐")
    .max(100, "一次最多审核 100 个候选套餐"),
  decision: z.enum(["accept", "reject"]),
  reason: z.string().trim().max(500, "拒绝原因不能超过 500 个字符").optional(),
});

export type ProviderMonitorActionInput = z.input<typeof monitorInputSchema>;

function parseConfigText(value: string, adapter: ProviderSourceAdapter) {
  if (!value) return parseProviderMonitorConfig({}, adapter);
  let config: unknown;
  try {
    config = JSON.parse(value);
  } catch (error) {
    throw new Error(
      `字段映射不是有效 JSON：${
        error instanceof Error ? error.message : "请检查逗号和引号"
      }`,
    );
  }
  return parseProviderMonitorConfig(config, adapter);
}

const providerMonitorIdSchema = z.number().int().positive("采集源 ID 无效");
const providerMonitorRunIdSchema = z
  .number()
  .int()
  .positive("采集运行 ID 无效");

const saveProviderMonitorMutation = defineAdminAction({
  action: "provider_monitor.save",
  entityType: "provider_monitor",
  parse: (input: ProviderMonitorActionInput) => monitorInputSchema.parse(input),
  execute: async (input) => {
    const endpointUrl = requirePublicHttpUrl(
      input.endpointUrl,
      "供应商采集地址",
    ).toString();
    const config = parseConfigText(input.configText, input.adapter);
    const mutationInput = {
      providerId: input.providerId,
      name: input.name,
      adapter: input.adapter,
      purpose: input.purpose,
      endpointUrl,
      config,
      enabled: input.enabled,
      autoPublish: input.autoPublish,
      missingThreshold: input.missingThreshold,
      intervalMinutes: input.intervalMinutes,
      timeoutSeconds: input.timeoutSeconds,
    };
    const result = input.id
      ? await updateProviderMonitor(input.id, mutationInput)
      : await createProviderMonitor(mutationInput);
    revalidatePath("/servers/monitor");
    return result;
  },
  successMessage: "供应商采集源已保存",
  errorTitle: "保存供应商采集源失败",
  errorSuggestion:
    "请检查供应商、网址、适配器、字段映射 JSON、执行间隔和超时时间。",
  entityId: (input, result) => result?.id ?? input.id,
});

const runProviderMonitorNowMutation = defineAdminAction({
  action: "provider_monitor.enqueue",
  entityType: "provider_monitor",
  parse: (id: number) => providerMonitorIdSchema.parse(id),
  execute: async (id) => {
    const monitor = (await getProviderMonitorList()).find(
      (item) => item.id === id,
    );
    if (!monitor) throw new Error("供应商采集源不存在");
    if (!monitor.enabled) throw new Error("请先启用采集源再立即运行");
    await enqueueProviderMonitorTask(id, new Date());
    revalidatePath("/servers/monitor");
    return { id };
  },
  successMessage: "供应商采集任务已加入后台队列",
  errorTitle: "启动供应商采集失败",
  errorSuggestion: "请确认采集源仍然存在且已启用，然后重新执行。",
  entityId: (id) => id,
});

const deleteProviderMonitorMutation = defineAdminAction({
  action: "provider_monitor.delete",
  entityType: "provider_monitor",
  parse: (id: number) => providerMonitorIdSchema.parse(id),
  execute: async (id) => {
    const result = await deleteProviderMonitor(id);
    revalidatePath("/servers/monitor");
    return result;
  },
  successMessage: "供应商采集源已删除",
  errorTitle: "删除供应商采集源失败",
  errorSuggestion: "正在运行的采集需要等待本次执行结束后再删除。",
  entityId: (id) => id,
});

const reviewProviderOfferCandidateMutation = defineAdminAction({
  action: "provider_offer_candidate.review",
  entityType: "provider_offer_candidate",
  parse: (input: z.input<typeof candidateReviewSchema>) =>
    candidateReviewSchema.parse(input),
  execute: async (input, session) => {
    const result =
      input.decision === "accept"
        ? await acceptProviderOfferCandidate({
            candidateId: input.candidateId,
            reviewerId: session.userId,
          })
        : await rejectProviderOfferCandidate({
            candidateId: input.candidateId,
            reviewerId: session.userId,
            reason: input.reason,
          });
    revalidatePath("/servers/monitor");
    revalidatePath("/servers/manage");
    revalidatePath("/ai-tasks");
    return result;
  },
  successMessage: "候选套餐审核已完成",
  errorTitle: "审核候选套餐失败",
  errorSuggestion: "请刷新页面确认候选状态后重试。",
  entityId: (input) => input.candidateId,
});

const reviewProviderOfferCandidatesMutation = defineAdminAction({
  action: "provider_offer_candidate.bulk_review",
  entityType: "provider_offer_candidate",
  parse: (input: z.input<typeof candidateBatchReviewSchema>) =>
    candidateBatchReviewSchema.parse(input),
  execute: async (input, session) => {
    const result = await reviewProviderOfferCandidates({
      ...input,
      reviewerId: session.userId,
    });
    revalidatePath("/servers/monitor");
    revalidatePath("/servers/manage");
    revalidatePath("/ai-tasks");
    return result;
  },
  successMessage: (result) => `已审核 ${result.processed} 个候选套餐`,
  errorTitle: "批量审核候选套餐失败",
  errorSuggestion: "请刷新页面确认候选状态后重试。",
  entityId: (input) => `batch:${input.candidateIds.length}`,
});

const retryProviderMonitorRunMutation = defineAdminAction({
  action: "provider_monitor_run.retry",
  entityType: "provider_monitor_run",
  parse: (runId: number) => providerMonitorRunIdSchema.parse(runId),
  execute: async (runId) => {
    const result = await retryProviderMonitorRun(runId);
    revalidatePath("/ai-tasks");
    revalidatePath("/servers/monitor");
    return result;
  },
  successMessage: "供应商采集已重新加入后台队列",
  errorTitle: "重试供应商采集失败",
  errorSuggestion: "请确认采集源已启用，并刷新任务中心确认最新状态。",
  entityId: (runId) => runId,
});

export async function saveProviderMonitorAction(
  rawInput: ProviderMonitorActionInput,
) {
  return saveProviderMonitorMutation(rawInput);
}

export async function runProviderMonitorNowAction(id: number) {
  return runProviderMonitorNowMutation(id);
}

export async function deleteProviderMonitorAction(id: number) {
  return deleteProviderMonitorMutation(id);
}

export async function previewProviderMonitorAction(
  rawInput: ProviderMonitorActionInput,
) {
  try {
    await requireAdminSession();
    const input = monitorInputSchema.parse(rawInput);
    const endpointUrl = requirePublicHttpUrl(
      input.endpointUrl,
      "供应商采集地址",
    ).toString();
    const config = parseConfigText(input.configText, input.adapter);
    const preview = await previewProviderMonitorSource({
      monitorId: input.id,
      adapter: input.adapter,
      endpointUrl,
      config,
      timeoutSeconds: input.timeoutSeconds,
    });
    return adminActionSuccess(
      preview,
      preview.detailIssues > 0
        ? `预览完成，识别 ${preview.total} 个套餐；${preview.detailIssues} 个产品详情页暂时无法读取完整周期`
        : `预览完成，识别 ${preview.total} 个套餐`,
    );
  } catch (error) {
    return adminActionFailure(error, {
      title: "采集预览失败",
      suggestion: "请检查网址可访问性、适配器和字段选择器，不会写入套餐数据。",
    });
  }
}

export async function reviewProviderOfferCandidateAction(input: {
  candidateId: number;
  decision: "accept" | "reject";
  reason?: string;
}) {
  return reviewProviderOfferCandidateMutation(input);
}

export async function reviewProviderOfferCandidatesAction(input: {
  candidateIds: number[];
  decision: "accept" | "reject";
  reason?: string;
}) {
  return reviewProviderOfferCandidatesMutation(input);
}

export async function retryProviderMonitorRunAction(runId: number) {
  return retryProviderMonitorRunMutation(runId);
}
