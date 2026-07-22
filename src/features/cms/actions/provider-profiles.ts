"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { parsePublicHttpUrl } from "@fwqgo/core/network-url";
import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import { db } from "@fwqgo/db";
import {
  affServiceProviders,
  providerProfileSnapshots,
  providerPromoCodes,
} from "@fwqgo/db/schema";
import { defineAdminAction } from "@/features/cms/lib/define-admin-action";
import { enqueueProviderProfileSnapshotTask } from "@/server/providers/provider-profile-tasks";
import { isOfficialProviderUrl } from "@/server/providers/provider-profile-scraper";
import type {
  ProviderProfileSnapshotData,
  ProviderProfileSnapshotStatus,
  ProviderPromoCodeData,
} from "@/types";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const optionalProfileText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}不能超过 ${max} 个字符`)
    .nullable()
    .optional();

const profileInputSchema = z.object({
  providerId: postgresIntegerIdSchema,
  summary: optionalProfileText(4_000, "供应商介绍"),
  summarySourceUrl: optionalProfileText(2_000, "介绍来源 URL"),
  refundPolicy: optionalProfileText(30_000, "退款政策"),
  refundPolicySourceUrl: optionalProfileText(2_000, "退款政策来源 URL"),
  prohibitedUses: optionalProfileText(30_000, "禁止事项"),
  prohibitedUsesSourceUrl: optionalProfileText(2_000, "禁止事项来源 URL"),
  markVerified: z.boolean().default(false),
});

const snapshotReviewSchema = z.object({
  snapshotId: postgresIntegerIdSchema,
  summary: optionalProfileText(4_000, "供应商介绍"),
  refundPolicy: optionalProfileText(30_000, "退款政策"),
  prohibitedUses: optionalProfileText(30_000, "禁止事项"),
});

const snapshotIdSchema = z.object({ snapshotId: postgresIntegerIdSchema });
const providerIdSchema = z.object({ providerId: postgresIntegerIdSchema });
const promoCodeIdSchema = z.object({ id: postgresIntegerIdSchema });

const promoCodeInputSchema = z.object({
  id: postgresIntegerIdSchema.optional(),
  providerId: postgresIntegerIdSchema,
  code: z.string().trim().min(1, "请填写优惠码").max(160),
  description: optionalProfileText(2_000, "优惠码说明"),
  discountText: optionalProfileText(500, "优惠内容"),
  terms: optionalProfileText(8_000, "使用条件"),
  startsAt: z.string().trim().nullable().optional(),
  endsAt: z.string().trim().nullable().optional(),
  active: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sourceUrl: optionalProfileText(2_000, "优惠码来源 URL"),
});

function refreshProviderWorkspace() {
  revalidatePath("/collect/aff-man");
}

function textOrNull(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalized;
}

function parseOptionalDate(value: string | null | undefined, label: string) {
  const normalized = textOrNull(value);
  if (!normalized) return null;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`${label}格式不正确`);
  return date;
}

function normalizePublicSourceUrl(
  value: string | null | undefined,
  label: string,
) {
  const normalized = textOrNull(value);
  if (!normalized) return null;
  const parsed = parsePublicHttpUrl(normalized);
  if (!parsed) throw new Error(`${label}只允许公网 http/https URL`);
  parsed.hash = "";
  return parsed.toString();
}

function normalizeOfficialSourceUrl(
  value: string | null | undefined,
  officialHost: string,
  label: string,
) {
  const normalized = textOrNull(value);
  if (!normalized) return null;
  const parsed = parsePublicHttpUrl(normalized);
  if (!parsed || !isOfficialProviderUrl(parsed, officialHost)) {
    throw new Error(`${label}必须来自当前供应商官网域名`);
  }
  parsed.hash = "";
  return parsed.toString();
}

function serializePromoCode(
  row: typeof providerPromoCodes.$inferSelect,
): ProviderPromoCodeData {
  return {
    id: row.id,
    providerId: row.providerId,
    code: row.code,
    description: row.description,
    discountText: row.discountText,
    terms: row.terms,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    active: row.active,
    isDefault: row.isDefault,
    sourceUrl: row.sourceUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

function serializeSnapshot(
  row: typeof providerProfileSnapshots.$inferSelect,
): ProviderProfileSnapshotData {
  const discoveredUrls = Array.isArray(row.discoveredUrls)
    ? row.discoveredUrls.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  return {
    id: row.id,
    providerId: row.providerId,
    status: row.status as ProviderProfileSnapshotStatus,
    summary: row.summary,
    summarySourceUrl: row.summarySourceUrl,
    refundPolicy: row.refundPolicy,
    refundPolicySourceUrl: row.refundPolicySourceUrl,
    prohibitedUses: row.prohibitedUses,
    prohibitedUsesSourceUrl: row.prohibitedUsesSourceUrl,
    discoveredUrls,
    error: row.error,
    fetchedAt: row.fetchedAt?.toISOString() ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

async function lockProvider(tx: DbTransaction, providerId: number) {
  const [provider] = await tx
    .select({
      id: affServiceProviders.id,
      officialUrl: affServiceProviders.officialUrl,
    })
    .from(affServiceProviders)
    .where(eq(affServiceProviders.id, providerId))
    .for("update")
    .limit(1);
  if (!provider) throw new Error("供应商不存在或已被删除");
  return provider;
}

async function syncLegacyDefaultPromoCode(
  tx: DbTransaction,
  providerId: number,
) {
  const [defaultCode] = await tx
    .select({ code: providerPromoCodes.code })
    .from(providerPromoCodes)
    .where(
      and(
        eq(providerPromoCodes.providerId, providerId),
        eq(providerPromoCodes.active, true),
        eq(providerPromoCodes.isDefault, true),
      ),
    )
    .limit(1);

  await tx
    .update(affServiceProviders)
    .set({
      defaultPromoCode: defaultCode?.code ?? null,
      updatedAt: new Date(),
    })
    .where(eq(affServiceProviders.id, providerId));
}

export async function getProviderProfileWorkspace(providerIds: number[]) {
  await requireAdminSession();
  const normalizedIds = [
    ...new Set(
      providerIds.filter(
        (id) => Number.isInteger(id) && id > 0 && id <= 2_147_483_647,
      ),
    ),
  ].slice(0, 100);
  if (normalizedIds.length === 0) {
    return { promoCodes: [], latestSnapshots: [] };
  }

  const [promoRows, snapshotRows] = await Promise.all([
    db
      .select()
      .from(providerPromoCodes)
      .where(inArray(providerPromoCodes.providerId, normalizedIds))
      .orderBy(
        asc(providerPromoCodes.providerId),
        desc(providerPromoCodes.isDefault),
        desc(providerPromoCodes.active),
        asc(providerPromoCodes.id),
      ),
    db
      .selectDistinctOn([providerProfileSnapshots.providerId])
      .from(providerProfileSnapshots)
      .where(inArray(providerProfileSnapshots.providerId, normalizedIds))
      .orderBy(
        providerProfileSnapshots.providerId,
        desc(providerProfileSnapshots.id),
      ),
  ]);

  return {
    promoCodes: promoRows.map(serializePromoCode),
    latestSnapshots: snapshotRows.map(serializeSnapshot),
  };
}

export const startProviderProfileCollection = defineAdminAction({
  action: "provider_profile.collect",
  entityType: "provider_profile_snapshot",
  parse: (input: z.input<typeof providerIdSchema>) =>
    providerIdSchema.parse(input),
  execute: async ({ providerId }, session) => {
    const [provider] = await db
      .select({ id: affServiceProviders.id })
      .from(affServiceProviders)
      .where(eq(affServiceProviders.id, providerId))
      .limit(1);
    if (!provider) throw new Error("供应商不存在或已被删除");

    const [openSnapshot] = await db
      .select()
      .from(providerProfileSnapshots)
      .where(
        and(
          eq(providerProfileSnapshots.providerId, providerId),
          inArray(providerProfileSnapshots.status, [
            "queued",
            "running",
            "pending",
          ]),
        ),
      )
      .orderBy(desc(providerProfileSnapshots.id))
      .limit(1);
    if (openSnapshot) {
      if (openSnapshot.status !== "pending") {
        await enqueueProviderProfileSnapshotTask(openSnapshot.id);
      }
      return {
        snapshotId: openSnapshot.id,
        status: openSnapshot.status,
        reused: true,
      };
    }

    const [snapshot] = await db
      .insert(providerProfileSnapshots)
      .values({ providerId, requestedBy: session.userId })
      .onConflictDoNothing()
      .returning();
    const selectedSnapshot =
      snapshot ??
      (
        await db
          .select()
          .from(providerProfileSnapshots)
          .where(
            and(
              eq(providerProfileSnapshots.providerId, providerId),
              inArray(providerProfileSnapshots.status, [
                "queued",
                "running",
                "pending",
              ]),
            ),
          )
          .orderBy(desc(providerProfileSnapshots.id))
          .limit(1)
      )[0];
    if (!selectedSnapshot) throw new Error("无法创建供应商采集快照");

    if (selectedSnapshot.status !== "pending") {
      try {
        await enqueueProviderProfileSnapshotTask(selectedSnapshot.id);
      } catch (error) {
        await db
          .update(providerProfileSnapshots)
          .set({
            status: "failed",
            error: error instanceof Error ? error.message : "后台任务入队失败",
            updatedAt: new Date(),
          })
          .where(eq(providerProfileSnapshots.id, selectedSnapshot.id));
        throw error;
      }
    }

    refreshProviderWorkspace();
    return {
      snapshotId: selectedSnapshot.id,
      status: selectedSnapshot.status,
      reused: !snapshot,
    };
  },
  successMessage: (result) =>
    result.status === "pending"
      ? "已有待审核采集结果"
      : "官网采集已加入后台队列",
  errorTitle: "供应商官网采集启动失败",
  errorSuggestion: "请检查官网域名、数据库迁移状态和后台任务日志。",
  entityId: (_input, result) => result?.snapshotId,
});

export const saveProviderProfile = defineAdminAction({
  action: "provider_profile.save",
  entityType: "aff_service_provider",
  parse: (input: z.input<typeof profileInputSchema>) =>
    profileInputSchema.parse(input),
  execute: async (input) => {
    const updated = await db.transaction(async (tx) => {
      const provider = await lockProvider(tx, input.providerId);
      const summary = textOrNull(input.summary);
      const summarySourceUrl = normalizeOfficialSourceUrl(
        input.summarySourceUrl,
        provider.officialUrl,
        "介绍来源 URL",
      );
      const refundPolicy = textOrNull(input.refundPolicy);
      const refundPolicySourceUrl = normalizeOfficialSourceUrl(
        input.refundPolicySourceUrl,
        provider.officialUrl,
        "退款政策来源 URL",
      );
      const prohibitedUses = textOrNull(input.prohibitedUses);
      const prohibitedUsesSourceUrl = normalizeOfficialSourceUrl(
        input.prohibitedUsesSourceUrl,
        provider.officialUrl,
        "禁止事项来源 URL",
      );
      if (summary && !summarySourceUrl) {
        throw new Error("供应商介绍缺少官网来源 URL");
      }
      if (refundPolicy && !refundPolicySourceUrl) {
        throw new Error("退款政策缺少官网来源 URL");
      }
      if (prohibitedUses && !prohibitedUsesSourceUrl) {
        throw new Error("禁止事项缺少官网来源 URL");
      }

      const now = new Date();
      const [result] = await tx
        .update(affServiceProviders)
        .set({
          summary,
          summarySourceUrl,
          refundPolicy,
          refundPolicySourceUrl,
          prohibitedUses,
          prohibitedUsesSourceUrl,
          profileVerifiedAt: input.markVerified ? now : null,
          profileUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(affServiceProviders.id, provider.id))
        .returning({ id: affServiceProviders.id });
      if (!result) throw new Error("供应商不存在或保存失败");
      return result;
    });

    refreshProviderWorkspace();
    return updated;
  },
  successMessage: "供应商档案已保存",
  errorTitle: "供应商档案保存失败",
  errorSuggestion: "政策来源必须是当前供应商官网中的公开 URL。",
  entityId: (input) => input.providerId,
});

export const applyProviderProfileSnapshot = defineAdminAction({
  action: "provider_profile_snapshot.apply",
  entityType: "provider_profile_snapshot",
  parse: (input: z.input<typeof snapshotReviewSchema>) =>
    snapshotReviewSchema.parse(input),
  execute: async (input, session) => {
    const result = await db.transaction(async (tx) => {
      const [snapshot] = await tx
        .select()
        .from(providerProfileSnapshots)
        .where(eq(providerProfileSnapshots.id, input.snapshotId))
        .for("update")
        .limit(1);
      if (!snapshot) throw new Error("采集快照不存在");
      if (snapshot.status !== "pending") {
        throw new Error("只有待审核的采集结果可以应用");
      }

      const [provider] = await tx
        .select()
        .from(affServiceProviders)
        .where(eq(affServiceProviders.id, snapshot.providerId))
        .for("update")
        .limit(1);
      if (!provider) throw new Error("供应商不存在或已被删除");

      const summary = textOrNull(input.summary);
      const refundPolicy = textOrNull(input.refundPolicy);
      const prohibitedUses = textOrNull(input.prohibitedUses);
      if (!summary && !refundPolicy && !prohibitedUses) {
        throw new Error("至少保留一项采集内容后再应用");
      }
      const summarySourceUrl = summary
        ? normalizeOfficialSourceUrl(
            snapshot.summarySourceUrl,
            provider.officialUrl,
            "供应商介绍候选来源 URL",
          )
        : null;
      const refundPolicySourceUrl = refundPolicy
        ? normalizeOfficialSourceUrl(
            snapshot.refundPolicySourceUrl,
            provider.officialUrl,
            "退款政策候选来源 URL",
          )
        : null;
      const prohibitedUsesSourceUrl = prohibitedUses
        ? normalizeOfficialSourceUrl(
            snapshot.prohibitedUsesSourceUrl,
            provider.officialUrl,
            "禁止事项候选来源 URL",
          )
        : null;
      if (summary && !summarySourceUrl) {
        throw new Error("供应商介绍候选缺少官网来源 URL");
      }
      if (refundPolicy && !refundPolicySourceUrl) {
        throw new Error("退款政策候选缺少官网来源 URL");
      }
      if (prohibitedUses && !prohibitedUsesSourceUrl) {
        throw new Error("禁止事项候选缺少官网来源 URL");
      }

      const now = new Date();
      await tx
        .update(affServiceProviders)
        .set({
          summary: summary ?? provider.summary,
          summarySourceUrl: summary
            ? summarySourceUrl
            : provider.summarySourceUrl,
          refundPolicy: refundPolicy ?? provider.refundPolicy,
          refundPolicySourceUrl: refundPolicy
            ? refundPolicySourceUrl
            : provider.refundPolicySourceUrl,
          prohibitedUses: prohibitedUses ?? provider.prohibitedUses,
          prohibitedUsesSourceUrl: prohibitedUses
            ? prohibitedUsesSourceUrl
            : provider.prohibitedUsesSourceUrl,
          profileVerifiedAt: now,
          profileUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(affServiceProviders.id, provider.id));
      await tx
        .update(providerProfileSnapshots)
        .set({
          status: "applied",
          reviewedBy: session.userId,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(providerProfileSnapshots.id, snapshot.id));

      return { id: snapshot.id, providerId: provider.id };
    });

    refreshProviderWorkspace();
    return result;
  },
  successMessage: "采集结果已应用到供应商档案",
  errorTitle: "采集结果应用失败",
  errorSuggestion:
    "请刷新页面确认状态；如果供应商官网已修改，请重新采集后再审核。",
  entityId: (input) => input.snapshotId,
});

export const rejectProviderProfileSnapshot = defineAdminAction({
  action: "provider_profile_snapshot.reject",
  entityType: "provider_profile_snapshot",
  parse: (input: z.input<typeof snapshotIdSchema>) =>
    snapshotIdSchema.parse(input),
  execute: async ({ snapshotId }, session) => {
    const now = new Date();
    const [snapshot] = await db
      .update(providerProfileSnapshots)
      .set({
        status: "rejected",
        reviewedBy: session.userId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(providerProfileSnapshots.id, snapshotId),
          eq(providerProfileSnapshots.status, "pending"),
        ),
      )
      .returning({
        id: providerProfileSnapshots.id,
        providerId: providerProfileSnapshots.providerId,
      });
    if (!snapshot) throw new Error("待审核采集结果不存在或状态已变化");

    refreshProviderWorkspace();
    return snapshot;
  },
  successMessage: "采集结果已驳回",
  errorTitle: "采集结果驳回失败",
  entityId: (input) => input.snapshotId,
});

export const saveProviderPromoCode = defineAdminAction({
  action: "provider_promo_code.save",
  entityType: "provider_promo_code",
  parse: (input: z.input<typeof promoCodeInputSchema>) => {
    const parsed = promoCodeInputSchema.parse(input);
    const startsAt = parseOptionalDate(parsed.startsAt, "开始时间");
    const endsAt = parseOptionalDate(parsed.endsAt, "结束时间");
    if (startsAt && endsAt && endsAt < startsAt) {
      throw new Error("结束时间不能早于开始时间");
    }
    if (parsed.isDefault && !parsed.active) {
      throw new Error("默认优惠码必须处于启用状态");
    }
    return { ...parsed, startsAt, endsAt };
  },
  execute: async (input) => {
    const result = await db.transaction(async (tx) => {
      await lockProvider(tx, input.providerId);
      const [current] = input.id
        ? await tx
            .select()
            .from(providerPromoCodes)
            .where(eq(providerPromoCodes.id, input.id))
            .for("update")
            .limit(1)
        : [];
      if (input.id && current?.providerId !== input.providerId) {
        throw new Error("优惠码不存在或不属于当前供应商");
      }

      const duplicateCondition = input.id
        ? and(
            eq(providerPromoCodes.providerId, input.providerId),
            sql`lower(${providerPromoCodes.code}) = lower(${input.code})`,
            ne(providerPromoCodes.id, input.id),
          )
        : and(
            eq(providerPromoCodes.providerId, input.providerId),
            sql`lower(${providerPromoCodes.code}) = lower(${input.code})`,
          );
      const [duplicate] = await tx
        .select({ id: providerPromoCodes.id })
        .from(providerPromoCodes)
        .where(duplicateCondition)
        .limit(1);
      if (duplicate) throw new Error(`优惠码「${input.code}」已存在`);

      const [existingDefault] = await tx
        .select({ id: providerPromoCodes.id })
        .from(providerPromoCodes)
        .where(
          and(
            eq(providerPromoCodes.providerId, input.providerId),
            eq(providerPromoCodes.isDefault, true),
          ),
        )
        .limit(1);
      const shouldBeDefault =
        input.active && (input.isDefault || (!input.id && !existingDefault));
      if (shouldBeDefault) {
        await tx
          .update(providerPromoCodes)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(providerPromoCodes.providerId, input.providerId));
      }

      const now = new Date();
      const values = {
        providerId: input.providerId,
        code: input.code,
        description: textOrNull(input.description),
        discountText: textOrNull(input.discountText),
        terms: textOrNull(input.terms),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        active: input.active,
        isDefault: shouldBeDefault,
        sourceUrl: normalizePublicSourceUrl(input.sourceUrl, "优惠码来源 URL"),
        updatedAt: now,
      };
      const [saved] = input.id
        ? await tx
            .update(providerPromoCodes)
            .set(values)
            .where(eq(providerPromoCodes.id, input.id))
            .returning()
        : await tx.insert(providerPromoCodes).values(values).returning();
      if (!saved) throw new Error("优惠码不存在或保存失败");

      await syncLegacyDefaultPromoCode(tx, input.providerId);
      return saved;
    });

    refreshProviderWorkspace();
    return serializePromoCode(result);
  },
  successMessage: "优惠码已保存",
  errorTitle: "优惠码保存失败",
  errorSuggestion: "请检查优惠码是否重复、有效期和来源 URL 是否正确。",
  entityId: (input, result) => result?.id ?? input.id,
});

export const deleteProviderPromoCode = defineAdminAction({
  action: "provider_promo_code.delete",
  entityType: "provider_promo_code",
  parse: (input: z.input<typeof promoCodeIdSchema>) =>
    promoCodeIdSchema.parse(input),
  execute: async ({ id }) => {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ providerId: providerPromoCodes.providerId })
        .from(providerPromoCodes)
        .where(eq(providerPromoCodes.id, id))
        .limit(1);
      if (!existing) throw new Error("优惠码不存在或已被删除");

      await lockProvider(tx, existing.providerId);
      const [current] = await tx
        .select()
        .from(providerPromoCodes)
        .where(eq(providerPromoCodes.id, id))
        .for("update")
        .limit(1);
      if (!current) throw new Error("优惠码不存在或已被删除");

      await tx
        .delete(providerPromoCodes)
        .where(eq(providerPromoCodes.id, current.id));
      await syncLegacyDefaultPromoCode(tx, current.providerId);
      return { id: current.id, providerId: current.providerId };
    });

    refreshProviderWorkspace();
    return result;
  },
  successMessage: "优惠码已删除",
  errorTitle: "优惠码删除失败",
  entityId: (input) => input.id,
});
