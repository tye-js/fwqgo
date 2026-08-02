import { and, desc, eq } from "drizzle-orm";

import {
  NETWORK_EXPERIENCE_ENGINE_VERSION,
  NETWORK_EXPERIENCE_SCHEMA_VERSION,
  type NetworkExperienceRuleSetSnapshot,
} from "@fwqgo/core/network-experience";
import { db, readDb } from "@fwqgo/db";
import { networkExperienceRuleArticles, networkExperienceRules, networkExperienceRuleSets, serverNetworkLines } from "@fwqgo/db/schema";

import { stableNetworkExperienceChecksum, validateNetworkExperienceSnapshot } from "./validation";

type DraftConfig = Omit<NetworkExperienceRuleSetSnapshot, "checksum">;

export type SaveNetworkExperienceRuleDraftInput = {
  versionLabel: string;
  config: DraftConfig;
  checksum: string;
  changeSummary?: string | null;
  enChangeSummary?: string | null;
  reviewDueAt?: Date | null;
  validUntil?: Date | null;
};

function assertDraft(input: SaveNetworkExperienceRuleDraftInput) {
  const candidate = { ...input.config, checksum: input.checksum } as NetworkExperienceRuleSetSnapshot;
  if (input.config.versionLabel !== input.versionLabel) throw new Error("规则集版本标签与快照不一致");
  if (!candidate.reviewDueAt || Number.isNaN(Date.parse(candidate.reviewDueAt))) throw new Error("经验规则必须提供有效复核日期");
  if (candidate.engineVersion !== NETWORK_EXPERIENCE_ENGINE_VERSION || candidate.schemaVersion !== NETWORK_EXPERIENCE_SCHEMA_VERSION) {
    throw new Error("经验规则 engine/schema 版本无效");
  }
  if (!validateNetworkExperienceSnapshot(candidate)) throw new Error("经验规则快照校验失败");
  if (stableNetworkExperienceChecksum(input.config) !== input.checksum) throw new Error("经验规则 checksum 不匹配");
}

export async function createNetworkExperienceRuleDraft(input: SaveNetworkExperienceRuleDraftInput, actorId: string | null = null) {
  assertDraft(input);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(networkExperienceRuleSets).values({
      versionLabel: input.versionLabel.trim(),
      engineVersion: input.config.engineVersion,
      schemaVersion: input.config.schemaVersion,
      status: "draft",
      snapshotJson: { ...input.config, checksum: input.checksum },
      checksum: input.checksum,
      revision: 1,
      changeSummary: input.changeSummary?.trim() ?? null,
      enChangeSummary: input.enChangeSummary?.trim() ?? null,
      reviewDueAt: input.config.reviewDueAt ? new Date(input.config.reviewDueAt) : input.reviewDueAt ?? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      validUntil: input.config.validUntil ? new Date(input.config.validUntil) : input.validUntil ?? null,
      createdBy: actorId,
    }).returning();
    if (!row) throw new Error("经验规则草稿创建失败");
    await insertRuleRows(tx, row.id, input.config.rules);
    return row;
  });
}

async function insertRuleRows(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], ruleSetId: number, rules: NetworkExperienceRuleSetSnapshot["rules"]) {
  for (const rule of rules) {
    const [line] = await tx.select({ id: serverNetworkLines.id }).from(serverNetworkLines).where(and(eq(serverNetworkLines.slug, rule.networkLineSlug), eq(serverNetworkLines.active, true))).limit(1);
    if (!line) throw new Error(`线路族不存在：${rule.networkLineSlug}`);
    const [storedRule] = await tx.insert(networkExperienceRules).values({
      ruleSetId,
      ruleKey: rule.ruleKey,
      networkLineId: line.id,
      userRegion: rule.userRegion,
      carrier: rule.carrier,
      accessType: rule.accessType,
      destinationRegion: rule.destinationRegion,
      workload: rule.workload,
      fit: rule.fit,
      basisStrength: rule.basisStrength,
      priority: rule.priority,
      conditionCodes: rule.conditionCodes,
      advantageCodes: rule.advantageCodes,
      riskCodes: rule.riskCodes,
      verificationCodes: rule.verificationCodes,
      sortOrder: rule.sortOrder ?? 0,
    }).returning({ id: networkExperienceRules.id });
    if (storedRule && rule.relatedArticleIds.length > 0) {
      await tx.insert(networkExperienceRuleArticles).values(
        [...new Set(rule.relatedArticleIds)].map((sourceArticleId, sortOrder) => ({ ruleId: storedRule.id, sourceArticleId, sortOrder })),
      );
    }
  }
}

export async function listNetworkExperienceRuleSets() {
  return readDb.select({
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

export async function cloneNetworkExperienceRuleSet(sourceId: number, versionLabel: string, actorId: string | null = null) {
  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(networkExperienceRuleSets).where(eq(networkExperienceRuleSets.id, sourceId)).for("update").limit(1);
    if (!source?.snapshotJson) throw new Error("规则集不存在或没有可克隆快照");
    const sourceSnapshot = source.snapshotJson as unknown as NetworkExperienceRuleSetSnapshot;
    const { checksum: _sourceChecksum, ...sourceWithoutChecksum } = sourceSnapshot;
    void _sourceChecksum;
    const snapshot = { ...sourceWithoutChecksum, versionLabel: versionLabel.trim() };
    const checksum = stableNetworkExperienceChecksum(snapshot);
    const [row] = await tx.insert(networkExperienceRuleSets).values({
      versionLabel: snapshot.versionLabel,
      engineVersion: snapshot.engineVersion,
      schemaVersion: snapshot.schemaVersion,
      status: "draft",
      snapshotJson: { ...snapshot, checksum },
      checksum,
      revision: source.revision + 1,
      changeSummary: `克隆自 ${source.versionLabel}`,
      createdBy: actorId,
    }).returning();
    if (!row) throw new Error("规则集克隆失败");
    await insertRuleRows(tx, row.id, snapshot.rules);
    return row;
  });
}

export async function reviewNetworkExperienceRuleSet(id: number, actorId: string, expectedRevision: number) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(networkExperienceRuleSets).where(eq(networkExperienceRuleSets.id, id)).for("update").limit(1);
    if (current?.revision !== expectedRevision) throw new Error("规则集已变化，请刷新后重试");
    if (current.status !== "draft") throw new Error("只有 draft 规则集可审核");
    if (current.createdBy === actorId) throw new Error("规则集审核人必须与创建人不同");
    const [updated] = await tx.update(networkExperienceRuleSets).set({ reviewedBy: actorId, reviewedAt: new Date() }).where(eq(networkExperienceRuleSets.id, id)).returning();
    if (!updated) throw new Error("规则集审核失败");
    return updated;
  });
}

export async function publishNetworkExperienceRuleSet(id: number, actorId: string, expectedRevision: number) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(networkExperienceRuleSets).where(eq(networkExperienceRuleSets.id, id)).for("update").limit(1);
    if (current?.revision !== expectedRevision) throw new Error("规则集已变化，请刷新后重试");
    if (current.status !== "draft") throw new Error("只有 draft 规则集可发布");
    if (!current.reviewedBy || current.reviewedBy === actorId || current.createdBy === actorId) throw new Error("发布人必须与创建人和审核人不同");
    if (current.reviewDueAt && current.reviewDueAt.getTime() < Date.now()) throw new Error("规则集复核日期已过期，请先创建新草稿");
    const snapshot = current.snapshotJson as unknown as NetworkExperienceRuleSetSnapshot;
    if (!validateNetworkExperienceSnapshot(snapshot) || snapshot.checksum !== current.checksum) throw new Error("规则集 checksum 已漂移");
    await tx.update(networkExperienceRuleSets).set({ status: "retired", retiredAt: new Date() }).where(eq(networkExperienceRuleSets.status, "published"));
    const [published] = await tx.update(networkExperienceRuleSets).set({ status: "published", publishedBy: actorId, publishedAt: new Date() }).where(and(eq(networkExperienceRuleSets.id, id), eq(networkExperienceRuleSets.revision, expectedRevision))).returning();
    if (!published) throw new Error("规则集发布失败");
    return published;
  });
}
