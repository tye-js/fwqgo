import { and, desc, eq } from "drizzle-orm";

import {
  stableRuleChecksum,
  type ServerSizingRuleSet,
} from "@fwqgo/core/server-sizing";
import { db, readDb } from "@fwqgo/db";
import { serverSizingRuleSets } from "@fwqgo/db/schema";

type RuleSetWithoutChecksum = Omit<ServerSizingRuleSet, "checksum">;

export type SaveSizingRuleDraftInput = {
  versionLabel: string;
  config: RuleSetWithoutChecksum;
  checksum: string;
  changeSummary?: string | null;
  enChangeSummary?: string | null;
  reviewDueAt?: Date | null;
  validUntil?: Date | null;
};

function assertRuleSetChecksum(input: SaveSizingRuleDraftInput) {
  const checksum = stableRuleChecksum(input.config);
  if (checksum !== input.checksum) {
    throw new Error("规则集 checksum 与规范化配置不一致");
  }
  if (input.config.status !== "draft") {
    throw new Error("新规则草稿必须使用 draft 状态");
  }
  if (input.config.schemaVersion < 1 || !input.config.engineVersion) {
    throw new Error("规则集 engine/schema 版本无效");
  }
}

export async function createServerSizingRuleDraft(
  input: SaveSizingRuleDraftInput,
  actorId: string | null = null,
) {
  assertRuleSetChecksum(input);
  const [row] = await db
    .insert(serverSizingRuleSets)
    .values({
      versionLabel: input.versionLabel.trim(),
      engineVersion: input.config.engineVersion,
      schemaVersion: input.config.schemaVersion,
      status: "draft",
      config: input.config,
      checksum: input.checksum,
      revision: 1,
      changeSummary: input.changeSummary?.trim() ?? null,
      enChangeSummary: input.enChangeSummary?.trim() ?? null,
      reviewDueAt: input.reviewDueAt ?? null,
      validUntil: input.validUntil ?? null,
      createdBy: actorId,
    })
    .returning();
  if (!row) throw new Error("规则草稿创建失败");
  return row;
}

export async function cloneServerSizingRuleSet(
  sourceId: number,
  versionLabel: string,
  actorId: string | null = null,
) {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(serverSizingRuleSets)
      .where(eq(serverSizingRuleSets.id, sourceId))
      .for("update")
      .limit(1);
    if (!source) throw new Error("规则集不存在");
    const config = source.config as unknown as RuleSetWithoutChecksum;
    const [row] = await tx
      .insert(serverSizingRuleSets)
      .values({
        versionLabel: versionLabel.trim(),
        engineVersion: source.engineVersion,
        schemaVersion: source.schemaVersion,
        status: "draft",
        config: { ...config, status: "draft" },
        checksum: stableRuleChecksum({ ...config, status: "draft" }),
        revision: source.revision + 1,
        changeSummary: `克隆自 ${source.versionLabel}`,
        createdBy: actorId,
      })
      .returning();
    if (!row) throw new Error("规则集克隆失败");
    return row;
  });
}

export async function reviewServerSizingRuleSet(
  id: number,
  actorId: string,
  expectedRevision: number,
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(serverSizingRuleSets)
      .where(eq(serverSizingRuleSets.id, id))
      .for("update")
      .limit(1);
    if (current?.revision !== expectedRevision) {
      throw new Error("规则集已变化，请刷新后重试");
    }
    if (current.status !== "draft") throw new Error("只有 draft 规则集可审核");
    if (current.createdBy && current.createdBy === actorId) {
      throw new Error("规则集审核人必须与创建人不同");
    }
    const [updated] = await tx
      .update(serverSizingRuleSets)
      .set({ reviewedBy: actorId, reviewedAt: new Date() })
      .where(eq(serverSizingRuleSets.id, id))
      .returning();
    if (!updated) throw new Error("规则集审核失败");
    return updated;
  });
}

export async function publishServerSizingRuleSet(
  id: number,
  actorId: string,
  expectedRevision: number,
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(serverSizingRuleSets)
      .where(eq(serverSizingRuleSets.id, id))
      .for("update")
      .limit(1);
    if (current?.revision !== expectedRevision) {
      throw new Error("规则集已变化，请刷新后重试");
    }
    if (current.status !== "draft") throw new Error("只有 draft 规则集可发布");
    if (!current.reviewedBy || !current.reviewedAt) {
      throw new Error("规则集必须先完成独立审核");
    }
    if (current.reviewedBy === actorId || current.createdBy === actorId) {
      throw new Error("发布人必须与创建人和审核人不同");
    }
    const checksum = stableRuleChecksum(
      current.config as unknown as RuleSetWithoutChecksum,
    );
    if (checksum !== current.checksum) {
      throw new Error("规则集 checksum 已漂移，请重新创建草稿");
    }
    await tx
      .update(serverSizingRuleSets)
      .set({ status: "retired", retiredAt: new Date() })
      .where(eq(serverSizingRuleSets.status, "published"));
    const [published] = await tx
      .update(serverSizingRuleSets)
      .set({
        status: "published",
        publishedBy: actorId,
        publishedAt: new Date(),
      })
      .where(
        and(
          eq(serverSizingRuleSets.id, id),
          eq(serverSizingRuleSets.revision, expectedRevision),
        ),
      )
      .returning();
    if (!published) throw new Error("规则集发布失败");
    return published;
  });
}

export async function getPublishedServerSizingRuleSet() {
  const [row] = await readDb
    .select()
    .from(serverSizingRuleSets)
    .where(eq(serverSizingRuleSets.status, "published"))
    .orderBy(desc(serverSizingRuleSets.publishedAt))
    .limit(1);
  return row ?? null;
}
