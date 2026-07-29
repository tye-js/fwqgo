"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { requirePublicHttpUrl } from "@fwqgo/core/network-url";
import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import {
  parseProviderMonitorConfig,
  PROVIDER_SOURCE_ADAPTERS,
  PROVIDER_SOURCE_PURPOSES,
  type ProviderMonitorConfig,
  type ProviderSourceAdapter,
} from "@fwqgo/core/provider-monitor-config";
import {
  adminActionFailure,
  adminActionSuccess,
} from "@/lib/admin-action-result";
import { defineAdminAction } from "@/features/cms/lib/define-admin-action";
import { getOrCreateOutboundShortLink } from "@/server/links/outbound-short-link";
import {
  createProviderMonitor,
  deleteProviderMonitor,
  deleteProviderMonitors,
  enqueueProviderMonitorTasks,
  previewProviderMonitorSource,
  retryProviderMonitorRun,
  updateProviderMonitor,
  updateProviderMonitorsEnabled,
} from "@/server/offers/provider-monitor";
import {
  acceptProviderOfferCandidate,
  rejectProviderOfferCandidate,
  reviewProviderOfferCandidates,
} from "@/server/offers/provider-offer-sync";

const monitorInputSchema = z.object({
  id: postgresIntegerIdSchema.optional(),
  providerId: postgresIntegerIdSchema,
  name: z.string().trim().min(1, "请输入采集源名称").max(160),
  adapter: z.enum(PROVIDER_SOURCE_ADAPTERS),
  purpose: z.enum(PROVIDER_SOURCE_PURPOSES),
  endpointUrl: z.string().trim().max(2_048, "供应商网址不能超过 2048 个字符"),
  externalProductId: z
    .string()
    .trim()
    .max(160, "商品稳定键不能超过 160 个字符")
    .default(""),
  affiliateTargetUrl: z
    .string()
    .trim()
    .max(4_096, "完整返利链接不能超过 4096 个字符")
    .default(""),
  sourceUrl: z
    .string()
    .trim()
    .max(4_096, "独立采集地址不能超过 4096 个字符")
    .default(""),
  notes: z.string().trim().max(2_000, "备注不能超过 2000 个字符").default(""),
  configText: z.string().trim().max(30_000),
  enabled: z.boolean(),
  autoPublish: z.boolean(),
  missingThreshold: z.number().int().min(1).max(20),
  intervalMinutes: z.number().int().min(1).max(10_080),
  timeoutSeconds: z.number().int().min(1).max(300),
});

const candidateReviewSchema = z.object({
  candidateId: postgresIntegerIdSchema,
  decision: z.enum(["accept", "reject"]),
  reason: z.string().trim().max(500, "拒绝原因不能超过 500 个字符").optional(),
});

const candidateBatchReviewSchema = z.object({
  candidateIds: z
    .array(postgresIntegerIdSchema)
    .min(1, "请至少选择一个候选套餐")
    .max(100, "一次最多审核 100 个候选套餐"),
  decision: z.enum(["accept", "reject"]),
  reason: z.string().trim().max(500, "拒绝原因不能超过 500 个字符").optional(),
});

const providerMonitorIdsSchema = z
  .array(postgresIntegerIdSchema)
  .min(1, "请至少选择一个供应商采集源")
  .max(100, "一次最多处理 100 个供应商采集源")
  .transform((ids) => [...new Set(ids)]);

const providerMonitorBatchToggleSchema = z.object({
  ids: providerMonitorIdsSchema,
  enabled: z.boolean(),
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

function parseAffiliateLinkInput(input: {
  adapter: ProviderSourceAdapter;
  externalProductId: string;
  affiliateTargetUrl: string;
  sourceUrl: string;
  notes: string;
}) {
  if (input.adapter !== "affiliate_link") return null;
  if (!input.externalProductId) throw new Error("请输入商品稳定键");
  if (!input.affiliateTargetUrl) throw new Error("请输入完整返利链接");
  const affiliateTarget = requirePublicHttpUrl(
    input.affiliateTargetUrl,
    "完整返利链接",
  );
  if (affiliateTarget.username || affiliateTarget.password) {
    throw new Error("完整返利链接不能包含用户名或密码");
  }
  const source = input.sourceUrl
    ? requirePublicHttpUrl(input.sourceUrl, "独立采集地址")
    : null;
  if (source?.username || source?.password) {
    throw new Error("独立采集地址不能包含用户名或密码");
  }
  return {
    externalProductId: input.externalProductId,
    affiliateTargetUrl: affiliateTarget.toString(),
    sourceUrl: source?.toString() ?? null,
    notes: input.notes || null,
  };
}

function assertAffiliateCollectionSource(
  affiliateLink: ReturnType<typeof parseAffiliateLinkInput>,
  config: ProviderMonitorConfig,
) {
  if (
    affiliateLink &&
    "collection" in config &&
    config.collection.type === "html_listing" &&
    !affiliateLink.sourceUrl
  ) {
    throw new Error("HTML 套餐列表模式必须填写独立采集地址");
  }
}

const providerMonitorIdSchema = postgresIntegerIdSchema;
const providerMonitorRunIdSchema = z
  .number()
  .int()
  .positive("采集运行 ID 无效")
  .refine(Number.isSafeInteger, "采集运行 ID 超出安全范围");

const saveProviderMonitorMutation = defineAdminAction({
  action: "provider_monitor.save",
  entityType: "provider_monitor",
  parse: (input: ProviderMonitorActionInput) => monitorInputSchema.parse(input),
  execute: async (input) => {
    const affiliateLinkInput = parseAffiliateLinkInput(input);
    const endpointUrl = affiliateLinkInput
      ? (affiliateLinkInput.sourceUrl ?? affiliateLinkInput.affiliateTargetUrl)
      : requirePublicHttpUrl(input.endpointUrl, "供应商采集地址").toString();
    const config = parseConfigText(input.configText, input.adapter);
    assertAffiliateCollectionSource(affiliateLinkInput, config);
    const shortLink = affiliateLinkInput
      ? await getOrCreateOutboundShortLink(
          affiliateLinkInput.affiliateTargetUrl,
        )
      : null;
    if (affiliateLinkInput && !shortLink) {
      throw new Error("完整返利链接无法生成站内短链");
    }
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
      affiliateLink:
        affiliateLinkInput && shortLink
          ? { ...affiliateLinkInput, outboundLinkId: shortLink.id }
          : null,
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
    "请检查商品稳定键、完整返利链接、独立采集地址、字段映射和执行参数。",
  entityId: (input, result) => result?.id ?? input.id,
});

const runProviderMonitorNowMutation = defineAdminAction({
  action: "provider_monitor.enqueue",
  entityType: "provider_monitor",
  parse: (id: number) => providerMonitorIdSchema.parse(id),
  execute: async (id) => {
    await enqueueProviderMonitorTasks([id]);
    revalidatePath("/servers/monitor");
    return { id };
  },
  successMessage: "供应商采集任务已加入后台队列",
  errorTitle: "启动供应商采集失败",
  errorSuggestion: "请确认采集源仍然存在且已启用，然后重新执行。",
  entityId: (id) => id,
});

const runProviderMonitorsNowMutation = defineAdminAction({
  action: "provider_monitor.bulk_enqueue",
  entityType: "provider_monitor",
  parse: (ids: number[]) => providerMonitorIdsSchema.parse(ids),
  execute: async (ids) => {
    const result = await enqueueProviderMonitorTasks(ids);
    revalidatePath("/servers/monitor");
    return result;
  },
  successMessage: (result) =>
    result.skipped > 0
      ? `已加入 ${result.queued} 个采集任务，跳过 ${result.skipped} 个已停用采集源`
      : `已加入 ${result.queued} 个供应商采集任务`,
  errorTitle: "批量启动供应商采集失败",
  errorSuggestion: "请刷新页面确认采集源状态，启用后再重新执行。",
  entityId: (ids) => `batch:${ids.length}`,
});

const updateProviderMonitorsEnabledMutation = defineAdminAction({
  action: "provider_monitor.bulk_toggle",
  entityType: "provider_monitor",
  parse: (input: { ids: number[]; enabled: boolean }) =>
    providerMonitorBatchToggleSchema.parse(input),
  execute: async (input) => {
    const result = await updateProviderMonitorsEnabled(
      input.ids,
      input.enabled,
    );
    revalidatePath("/servers/monitor");
    return result;
  },
  successMessage: (result) => {
    const action = result.enabled ? "启用" : "停用";
    return result.unchanged > 0
      ? `已${action} ${result.updated} 个采集源，${result.unchanged} 个状态未变`
      : `已${action} ${result.updated} 个供应商采集源`;
  },
  errorTitle: "批量更新供应商采集源失败",
  errorSuggestion: "请刷新页面确认采集源状态后重试。",
  entityId: (input) => `batch:${input.ids.length}`,
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

const deleteProviderMonitorsMutation = defineAdminAction({
  action: "provider_monitor.bulk_delete",
  entityType: "provider_monitor",
  parse: (ids: number[]) => providerMonitorIdsSchema.parse(ids),
  execute: async (ids) => {
    const result = await deleteProviderMonitors(ids);
    revalidatePath("/servers/monitor");
    return result;
  },
  successMessage: (result) => `已删除 ${result.deleted} 个供应商采集源`,
  errorTitle: "批量删除供应商采集源失败",
  errorSuggestion: "正在运行的采集需要等待本次执行结束后再删除。",
  entityId: (ids) => `batch:${ids.length}`,
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

export async function runProviderMonitorsNowAction(ids: number[]) {
  return runProviderMonitorsNowMutation(ids);
}

export async function updateProviderMonitorsEnabledAction(input: {
  ids: number[];
  enabled: boolean;
}) {
  return updateProviderMonitorsEnabledMutation(input);
}

export async function deleteProviderMonitorAction(id: number) {
  return deleteProviderMonitorMutation(id);
}

export async function deleteProviderMonitorsAction(ids: number[]) {
  return deleteProviderMonitorsMutation(ids);
}

export async function previewProviderMonitorAction(
  rawInput: ProviderMonitorActionInput,
) {
  try {
    await requireAdminSession();
    const input = monitorInputSchema.parse(rawInput);
    const affiliateLink = parseAffiliateLinkInput(input);
    const endpointUrl = affiliateLink
      ? (affiliateLink.sourceUrl ?? affiliateLink.affiliateTargetUrl)
      : requirePublicHttpUrl(input.endpointUrl, "供应商采集地址").toString();
    const config = parseConfigText(input.configText, input.adapter);
    assertAffiliateCollectionSource(affiliateLink, config);
    const preview = await previewProviderMonitorSource({
      monitorId: input.id,
      providerId: input.providerId,
      adapter: input.adapter,
      endpointUrl,
      config,
      timeoutSeconds: input.timeoutSeconds,
      affiliateLink: affiliateLink
        ? {
            externalProductId: affiliateLink.externalProductId,
            affiliateTargetUrl: affiliateLink.affiliateTargetUrl,
            sourceUrl: affiliateLink.sourceUrl,
          }
        : undefined,
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
      suggestion:
        "请检查商品稳定键、完整返利链接、独立采集地址和字段选择器，不会写入套餐数据。",
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
