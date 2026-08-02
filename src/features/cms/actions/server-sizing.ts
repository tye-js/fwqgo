"use server";

import { desc } from "drizzle-orm";
import { z } from "zod";

import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import type { ServerSizingRuleSet } from "@fwqgo/core/server-sizing";
import { db } from "@fwqgo/db";
import { serverSizingRuleSets } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import { defineAdminAction } from "@/features/cms/lib/define-admin-action";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import {
  cloneServerSizingRuleSet,
  createServerSizingRuleDraft,
  publishServerSizingRuleSet,
  reviewServerSizingRuleSet,
} from "@/server/server-sizing/service";

const commandSchema = z.object({
  id: postgresIntegerIdSchema,
  expectedRevision: z.number().int().positive(),
});
const cloneSchema = z.object({
  id: postgresIntegerIdSchema,
  versionLabel: z.string().trim().min(1).max(80),
});
const createSchema = z.object({
  versionLabel: z.string().trim().min(1).max(80),
  config: z.record(z.string(), z.unknown()),
  checksum: z.string().trim().min(8).max(128),
  changeSummary: z.string().trim().max(2_000).nullable().optional(),
  enChangeSummary: z.string().trim().max(2_000).nullable().optional(),
  reviewDueAt: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
});

export const createServerSizingRules = defineAdminAction({
  action: "server_sizing.rules.create",
  entityType: "server_sizing_rule_set",
  parse: (input: z.input<typeof createSchema>) => createSchema.parse(input),
  execute: async (input, session) =>
    createServerSizingRuleDraft(
      {
        ...input,
        config: input.config as Omit<ServerSizingRuleSet, "checksum">,
      },
      session.userId,
    ),
  successMessage: "规则集草稿已创建",
  errorTitle: "规则集草稿创建失败",
  errorSuggestion: "请确认 config 与 checksum 来自同一规则版本。",
  entityId: (input) => input.versionLabel,
});

export const reviewServerSizingRules = defineAdminAction({
  action: "server_sizing.rules.review",
  entityType: "server_sizing_rule_set",
  parse: (input: z.input<typeof commandSchema>) => commandSchema.parse(input),
  execute: async (input, session) =>
    reviewServerSizingRuleSet(input.id, session.userId, input.expectedRevision),
  successMessage: "规则集审核已记录",
  errorTitle: "规则集审核失败",
  entityId: (input) => input.id,
});

export const publishServerSizingRules = defineAdminAction({
  action: "server_sizing.rules.publish",
  entityType: "server_sizing_rule_set",
  parse: (input: z.input<typeof commandSchema>) => commandSchema.parse(input),
  execute: async (input, session) => {
    const result = await publishServerSizingRuleSet(
      input.id,
      session.userId,
      input.expectedRevision,
    );
    schedulePublicWebCache("server-sizing.changed");
    return result;
  },
  successMessage: "规则集已发布，旧版本已归档",
  errorTitle: "规则集发布失败",
  errorSuggestion: "必须先由不同管理员完成审核，并核对 checksum。",
  entityId: (input) => input.id,
});

export const cloneServerSizingRules = defineAdminAction({
  action: "server_sizing.rules.clone",
  entityType: "server_sizing_rule_set",
  parse: (input: z.input<typeof cloneSchema>) => cloneSchema.parse(input),
  execute: async (input, session) =>
    cloneServerSizingRuleSet(input.id, input.versionLabel, session.userId),
  successMessage: "规则集草稿已克隆",
  errorTitle: "规则集克隆失败",
  entityId: (input) => input.id,
});

export async function getServerSizingRulesAdmin() {
  await requireAdminSession();
  return db
    .select({
      id: serverSizingRuleSets.id,
      versionLabel: serverSizingRuleSets.versionLabel,
      engineVersion: serverSizingRuleSets.engineVersion,
      schemaVersion: serverSizingRuleSets.schemaVersion,
      status: serverSizingRuleSets.status,
      checksum: serverSizingRuleSets.checksum,
      revision: serverSizingRuleSets.revision,
      reviewedBy: serverSizingRuleSets.reviewedBy,
      publishedBy: serverSizingRuleSets.publishedBy,
      createdAt: serverSizingRuleSets.createdAt,
      publishedAt: serverSizingRuleSets.publishedAt,
    })
    .from(serverSizingRuleSets)
    .orderBy(desc(serverSizingRuleSets.createdAt));
}
