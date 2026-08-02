"use server";

import { desc } from "drizzle-orm";
import { z } from "zod";

import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import type { NetworkExperienceRuleSetSnapshot } from "@fwqgo/core/network-experience";
import { db } from "@fwqgo/db";
import { networkExperienceRuleSets } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import { defineAdminAction } from "@/features/cms/lib/define-admin-action";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import {
  cloneNetworkExperienceRuleSet,
  createNetworkExperienceRuleDraft,
  publishNetworkExperienceRuleSet,
  reviewNetworkExperienceRuleSet,
} from "@/server/network-experience/service";

const commandSchema = z.object({ id: postgresIntegerIdSchema, expectedRevision: z.number().int().positive() });
const cloneSchema = z.object({ id: postgresIntegerIdSchema, versionLabel: z.string().trim().min(1).max(80) });
const createSchema = z.object({
  versionLabel: z.string().trim().min(1).max(80),
  config: z.record(z.string(), z.unknown()),
  checksum: z.string().trim().min(8).max(128),
  changeSummary: z.string().trim().max(2_000).nullable().optional(),
  enChangeSummary: z.string().trim().max(2_000).nullable().optional(),
  reviewDueAt: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
});

export const createNetworkExperienceRules = defineAdminAction({
  action: "network_experience.rules.create",
  entityType: "network_experience_rule_set",
  parse: (input: z.input<typeof createSchema>) => createSchema.parse(input),
  execute: async (input, session) => createNetworkExperienceRuleDraft({
    ...input,
    config: input.config as unknown as Omit<NetworkExperienceRuleSetSnapshot, "checksum">,
  }, session.userId),
  successMessage: "线路经验规则草稿已创建",
  errorTitle: "线路经验规则草稿创建失败",
  errorSuggestion: "请确认规则、风险码、验证码和 checksum 来自同一版本。",
  entityId: (input) => input.versionLabel,
});

export const reviewNetworkExperienceRules = defineAdminAction({
  action: "network_experience.rules.review",
  entityType: "network_experience_rule_set",
  parse: (input: z.input<typeof commandSchema>) => commandSchema.parse(input),
  execute: async (input, session) => reviewNetworkExperienceRuleSet(input.id, session.userId, input.expectedRevision),
  successMessage: "线路经验规则审核已记录",
  errorTitle: "线路经验规则审核失败",
  entityId: (input) => input.id,
});

export const publishNetworkExperienceRules = defineAdminAction({
  action: "network_experience.rules.publish",
  entityType: "network_experience_rule_set",
  parse: (input: z.input<typeof commandSchema>) => commandSchema.parse(input),
  execute: async (input, session) => {
    const result = await publishNetworkExperienceRuleSet(input.id, session.userId, input.expectedRevision);
    schedulePublicWebCache("network-experience.changed");
    return result;
  },
  successMessage: "线路经验规则已发布，旧版本已归档",
  errorTitle: "线路经验规则发布失败",
  errorSuggestion: "必须先由不同管理员完成审核，并核对 checksum。",
  entityId: (input) => input.id,
});

export const cloneNetworkExperienceRules = defineAdminAction({
  action: "network_experience.rules.clone",
  entityType: "network_experience_rule_set",
  parse: (input: z.input<typeof cloneSchema>) => cloneSchema.parse(input),
  execute: async (input, session) => cloneNetworkExperienceRuleSet(input.id, input.versionLabel, session.userId),
  successMessage: "线路经验规则草稿已克隆",
  errorTitle: "线路经验规则克隆失败",
  entityId: (input) => input.id,
});

export async function getNetworkExperienceRulesAdmin() {
  await requireAdminSession();
  return db.select({
    id: networkExperienceRuleSets.id,
    versionLabel: networkExperienceRuleSets.versionLabel,
    engineVersion: networkExperienceRuleSets.engineVersion,
    schemaVersion: networkExperienceRuleSets.schemaVersion,
    status: networkExperienceRuleSets.status,
    checksum: networkExperienceRuleSets.checksum,
    revision: networkExperienceRuleSets.revision,
    reviewedBy: networkExperienceRuleSets.reviewedBy,
    publishedBy: networkExperienceRuleSets.publishedBy,
    createdAt: networkExperienceRuleSets.createdAt,
    publishedAt: networkExperienceRuleSets.publishedAt,
  }).from(networkExperienceRuleSets).orderBy(desc(networkExperienceRuleSets.createdAt));
}
