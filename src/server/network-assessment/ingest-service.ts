import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";

import { parseMeasurementBatchPayload } from "@fwqgo/core/network-assessment";
import { decryptSecret } from "@fwqgo/core/secret-envelope";
import { db } from "@fwqgo/db";
import {
  networkMeasurementCampaigns,
  networkMeasurementCampaignRevisions,
  networkMeasurementCredentials,
  networkMeasurementIngestNonces,
  networkMeasurementProbeRevisions,
  networkMeasurementRawBatches,
  networkMeasurementRuns,
  networkMeasurementSamples,
  networkMeasurementTargets,
  networkMeasurementTargetRevisions,
  networkTargetAgentRevisions,
  networkMeasurementProbes,
  networkTargetAgents,
} from "@fwqgo/db/schema";
import {
  NETWORK_CLOCK_SKEW_SECONDS,
  NETWORK_MAX_BODY_BYTES,
  type NetworkPrincipalKind,
  type NetworkRequestSignatureHeaders,
  verifyNetworkRequestSignature,
  signNetworkTask,
} from "./signing";

export const NETWORK_INGEST_PATH = "/api/internal/network-measurements/ingest";
export const NETWORK_PULL_PATH =
  "/api/internal/network-measurements/tasks/pull";
export const NETWORK_RAW_BATCH_RETENTION_DAYS = 30;

export class NetworkIngestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 400) {
    super(code);
    this.name = "NetworkIngestError";
    this.code = code;
    this.status = status;
  }
}

export type NetworkIngestRequest = {
  method: string;
  path: string;
  headers: NetworkRequestSignatureHeaders;
  body: Uint8Array;
  now?: Date;
};

type CredentialRow = {
  id: number;
  keyId: string;
  secretCiphertext: string;
  activatedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  principalKind: NetworkPrincipalKind;
  principalExternalId: string;
  probeId: number | null;
  targetAgentId: number | null;
};

type IngestTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ProbeSelector = Record<string, unknown>;

function selectorValues(value: unknown, label: string) {
  if (value === undefined) return [] as string[];
  const values = Array.isArray(value) ? value : [value];
  if (
    values.some(
      (item) => typeof item !== "string" || item.trim().length === 0,
    )
  ) {
    throw new NetworkIngestError(`${label}_selector_invalid`, 409);
  }
  return values.map((item) => (item as string).trim());
}

function matchesProbeSelector(
  selector: ProbeSelector,
  revision: {
    countryCode: string | null;
    regionCode: string;
    carrier: string;
    accessType: string;
    asn: bigint | null;
    capabilities: string[];
    trustLevel: string;
    ownerOrgKey: string;
    independenceKey: string;
  },
) {
  if (Array.isArray(selector) || !selector || typeof selector !== "object") {
    throw new NetworkIngestError("probe_selector_invalid", 409);
  }
  const allowedKeys = new Set([
    "countryCode",
    "countryCodes",
    "regionCode",
    "regions",
    "carrier",
    "carriers",
    "accessType",
    "accessTypes",
    "asn",
    "capabilities",
    "trustLevel",
    "ownerOrgKey",
    "independenceKey",
  ]);
  if (Object.keys(selector).some((key) => !allowedKeys.has(key))) {
    throw new NetworkIngestError("probe_selector_invalid", 409);
  }

  const match = (
    key: keyof typeof revision,
    value: string | null,
    alias?: string,
  ) => {
    if (selector[key] !== undefined && alias && selector[alias] !== undefined) {
      throw new NetworkIngestError("probe_selector_invalid", 409);
    }
    const expected = selectorValues(
      selector[key] ?? (alias ? selector[alias] : undefined),
      key,
    );
    return expected.length === 0 || (value !== null && expected.includes(value));
  };
  if (!match("countryCode", revision.countryCode, "countryCodes")) return false;
  if (!match("regionCode", revision.regionCode, "regions")) return false;
  if (!match("carrier", revision.carrier, "carriers")) return false;
  if (!match("accessType", revision.accessType, "accessTypes")) return false;
  if (!match("trustLevel", revision.trustLevel)) return false;
  if (!match("ownerOrgKey", revision.ownerOrgKey)) return false;
  if (!match("independenceKey", revision.independenceKey)) return false;

  if (selector.asn !== undefined) {
    const values = Array.isArray(selector.asn) ? selector.asn : [selector.asn];
    if (
      values.some(
        (item) =>
          (typeof item !== "number" && typeof item !== "string") ||
          !/^\d+$/u.test(String(item)),
      )
    ) {
      throw new NetworkIngestError("asn_selector_invalid", 409);
    }
    if (
      revision.asn === null ||
      !values.some((item) => revision.asn === BigInt(String(item)))
    ) {
      return false;
    }
  }

  if (selector.capabilities !== undefined) {
    const required = selectorValues(selector.capabilities, "capabilities");
    if (!required.every((item) => revision.capabilities.includes(item))) {
      return false;
    }
  }
  return true;
}

async function findCredential(
  tx: IngestTransaction,
  headers: NetworkRequestSignatureHeaders,
  now: Date,
): Promise<CredentialRow | null> {
  const baseWhere = isNull(networkMeasurementCredentials.revokedAt);
  if (headers.principalKind === "probe") {
    const [row] = await tx
      .select({
        id: networkMeasurementCredentials.id,
        keyId: networkMeasurementCredentials.keyId,
        secretCiphertext: networkMeasurementCredentials.secretCiphertext,
        activatedAt: networkMeasurementCredentials.activatedAt,
        expiresAt: networkMeasurementCredentials.expiresAt,
        revokedAt: networkMeasurementCredentials.revokedAt,
        principalExternalId: networkMeasurementProbes.externalId,
        probeId: networkMeasurementProbes.id,
      })
      .from(networkMeasurementCredentials)
      .innerJoin(
        networkMeasurementProbes,
        eq(networkMeasurementProbes.id, networkMeasurementCredentials.probeId),
      )
      .where(
        and(
          baseWhere,
          eq(networkMeasurementProbes.externalId, headers.principalExternalId),
          eq(networkMeasurementCredentials.keyId, headers.keyId),
          eq(networkMeasurementProbes.status, "active"),
        ),
      )
      .limit(1);
    if (!row) return null;
    if (
      row.activatedAt > now ||
      (row.expiresAt && row.expiresAt <= now) ||
      row.revokedAt
    ) {
      return null;
    }
    return { ...row, principalKind: "probe", targetAgentId: null };
  }

  const [row] = await tx
    .select({
      id: networkMeasurementCredentials.id,
      keyId: networkMeasurementCredentials.keyId,
      secretCiphertext: networkMeasurementCredentials.secretCiphertext,
      activatedAt: networkMeasurementCredentials.activatedAt,
      expiresAt: networkMeasurementCredentials.expiresAt,
      revokedAt: networkMeasurementCredentials.revokedAt,
      principalExternalId: networkTargetAgents.externalId,
      targetAgentId: networkTargetAgents.id,
    })
    .from(networkMeasurementCredentials)
    .innerJoin(
      networkTargetAgents,
      eq(networkTargetAgents.id, networkMeasurementCredentials.targetAgentId),
    )
    .where(
      and(
        baseWhere,
        eq(networkTargetAgents.externalId, headers.principalExternalId),
        eq(networkMeasurementCredentials.keyId, headers.keyId),
        eq(networkTargetAgents.status, "active"),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (
    row.activatedAt > now ||
    (row.expiresAt && row.expiresAt <= now) ||
    row.revokedAt
  ) {
    return null;
  }
  return { ...row, principalKind: "target_agent", probeId: null };
}

async function ensureAllowedRevisions(
  tx: IngestTransaction,
  credential: CredentialRow,
  sampleProbeRevisionIds: number[],
  sampleTargetRevisionIds: number[],
) {
  if (credential.probeId) {
    const rows = await tx
      .select({ id: networkMeasurementProbeRevisions.id })
      .from(networkMeasurementProbeRevisions)
      .where(
        and(
          eq(networkMeasurementProbeRevisions.probeId, credential.probeId),
          inArray(networkMeasurementProbeRevisions.id, sampleProbeRevisionIds),
        ),
      );
    if (new Set(rows.map((row) => row.id)).size !== new Set(sampleProbeRevisionIds).size) {
      throw new NetworkIngestError("probe_revision_not_allowed", 403);
    }
    return;
  }
  if (!credential.targetAgentId) {
    throw new NetworkIngestError("credential_owner_missing", 403);
  }
  const rows = await tx
    .select({ id: networkMeasurementTargetRevisions.id })
    .from(networkMeasurementTargetRevisions)
    .innerJoin(
      networkTargetAgentRevisions,
      eq(
        networkTargetAgentRevisions.id,
        networkMeasurementTargetRevisions.targetAgentRevisionId,
      ),
    )
    .where(
      and(
        eq(networkTargetAgentRevisions.targetAgentId, credential.targetAgentId),
        inArray(networkMeasurementTargetRevisions.id, sampleTargetRevisionIds),
      ),
    );
  if (new Set(rows.map((row) => row.id)).size !== new Set(sampleTargetRevisionIds).size) {
    throw new NetworkIngestError("target_revision_not_allowed", 403);
  }
}

function parseBody(body: Uint8Array) {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(body).toString("utf8"));
  } catch {
    throw new NetworkIngestError("invalid_json");
  }
  const parsed = parseMeasurementBatchPayload(value);
  if (!parsed.value) throw new NetworkIngestError("invalid_measurement_batch");
  return { value: parsed.value, raw: value };
}

export async function ingestNetworkMeasurementBatch(input: NetworkIngestRequest) {
  if (input.body.byteLength > NETWORK_MAX_BODY_BYTES) {
    throw new NetworkIngestError("body_too_large", 413);
  }
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const credential = await findCredential(tx, input.headers, now);
    if (!credential) throw new NetworkIngestError("credential_not_found", 401);
    const secret = decryptSecret(credential.secretCiphertext).value;
    const verified = verifyNetworkRequestSignature({
      method: input.method,
      path: input.path,
      allowedPath: NETWORK_INGEST_PATH,
      headers: input.headers,
      body: input.body,
      secret,
      nowSeconds: Math.floor(now.getTime() / 1000),
      clockSkewSeconds: NETWORK_CLOCK_SKEW_SECONDS,
    });
    if (!verified.ok) throw new NetworkIngestError(`signature_${verified.code}`, 401);

    const expiresAt = new Date(
      now.getTime() + NETWORK_RAW_BATCH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const [nonce] = await tx
      .insert(networkMeasurementIngestNonces)
      .values({
        credentialId: credential.id,
        nonce: input.headers.nonce,
        requestTimestamp: new Date(Number(input.headers.requestTimestamp) * 1000),
        expiresAt: new Date(
          now.getTime() + (NETWORK_CLOCK_SKEW_SECONDS + 7 * 24 * 60 * 60) * 1000,
        ),
      })
      .onConflictDoNothing()
      .returning();
    if (!nonce) throw new NetworkIngestError("nonce_replayed", 409);

    const { value: batch, raw } = parseBody(input.body);
    const [run] = await tx
      .select({
        id: networkMeasurementRuns.id,
        status: networkMeasurementRuns.status,
        runGeneration: networkMeasurementRuns.runGeneration,
        campaignId: networkMeasurementRuns.campaignId,
        candidateId: networkMeasurementCampaigns.candidateId,
      })
      .from(networkMeasurementRuns)
      .innerJoin(
        networkMeasurementCampaigns,
        eq(networkMeasurementCampaigns.id, networkMeasurementRuns.campaignId),
      )
      .where(eq(networkMeasurementRuns.id, batch.runId))
      .for("update")
      .limit(1);
    if (!run) throw new NetworkIngestError("run_not_found", 404);
    if (run.runGeneration !== batch.runGeneration) {
      throw new NetworkIngestError("stale_run_generation", 409);
    }
    if (!["queued", "running"].includes(run.status)) {
      throw new NetworkIngestError("run_not_accepting_samples", 409);
    }

    await ensureAllowedRevisions(
      tx,
      credential,
      [...new Set(batch.samples.map((sample) => sample.probeRevisionId))],
      [...new Set(batch.samples.map((sample) => sample.targetRevisionId))],
    );

    const [existing] = await tx
      .select({ id: networkMeasurementRawBatches.id, bodyHash: networkMeasurementRawBatches.bodyHash })
      .from(networkMeasurementRawBatches)
      .where(
        and(
          eq(networkMeasurementRawBatches.credentialId, credential.id),
          eq(networkMeasurementRawBatches.batchId, batch.batchId),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.bodyHash !== verified.bodyHash) {
        throw new NetworkIngestError("batch_hash_conflict", 409);
      }
      return {
        accepted: true,
        idempotent: true,
        runId: batch.runId,
        batchId: batch.batchId,
        sampleCount: 0,
      };
    }

    const [rawBatch] = await tx
      .insert(networkMeasurementRawBatches)
      .values({
        runId: batch.runId,
        sourceKind: input.headers.principalKind,
        credentialId: credential.id,
        batchId: batch.batchId,
        bodyHash: verified.bodyHash,
        payload: raw as Record<string, unknown>,
        receivedAt: now,
        expiresAt,
      })
      .returning();
    if (!rawBatch) throw new NetworkIngestError("raw_batch_write_failed", 500);

    await tx.insert(networkMeasurementSamples).values(
      batch.samples.map((sample) => ({
        runId: batch.runId,
        rawBatchId: rawBatch.id,
        probeRevisionId: sample.probeRevisionId,
        targetRevisionId: sample.targetRevisionId,
        direction: sample.direction,
        protocol: sample.protocol,
        observedAt: new Date(sample.observedAt),
        rttMs: sample.rttMs ?? null,
        jitterMs: sample.jitterMs ?? null,
        packetLossBps: sample.packetLossBps ?? null,
        throughputKbps: sample.throughputKbps ?? null,
        ttfbMs: sample.ttfbMs ?? null,
        pathHash: sample.pathHash ?? null,
        qualityFlags: sample.qualityFlags ?? [],
        parserVersion: "network-measurement-parser-v1",
      })),
    );
    const expectedTargets = await tx
      .select({
        targetRevisionId: networkMeasurementTargetRevisions.id,
      })
      .from(networkMeasurementTargets)
      .innerJoin(
        networkMeasurementTargetRevisions,
        eq(
          networkMeasurementTargetRevisions.id,
          networkMeasurementTargets.currentConfigurationRevisionId,
        ),
      )
      .where(
        and(
          eq(networkMeasurementTargets.candidateId, run.candidateId),
          eq(networkMeasurementTargets.enabled, true),
        ),
      );
    const receivedTargets = await tx
      .select({ targetRevisionId: networkMeasurementSamples.targetRevisionId })
      .from(networkMeasurementSamples)
      .where(eq(networkMeasurementSamples.runId, batch.runId));
    const expectedTargetIds = new Set(
      expectedTargets.map((item) => item.targetRevisionId),
    );
    const receivedTargetIds = new Set(
      receivedTargets.map((item) => item.targetRevisionId),
    );
    const coverageBps = expectedTargetIds.size
      ? Math.min(
          10_000,
          Math.floor(
            (receivedTargetIds.size / expectedTargetIds.size) * 10_000,
          ),
        )
      : 0;
    const completed =
      expectedTargetIds.size > 0 &&
      [...expectedTargetIds].every((targetRevisionId) =>
        receivedTargetIds.has(targetRevisionId),
      );
    await tx
      .update(networkMeasurementRuns)
      .set({
        status: completed ? "succeeded" : "running",
        coverageBps,
        finishedAt: completed ? now : null,
      })
      .where(
        and(
          eq(networkMeasurementRuns.id, batch.runId),
          eq(networkMeasurementRuns.runGeneration, batch.runGeneration),
        ),
      );
    return {
      accepted: true,
      idempotent: false,
      runId: batch.runId,
      batchId: batch.batchId,
      sampleCount: batch.samples.length,
    };
  });
}

export async function pullNetworkMeasurementTask(input: NetworkIngestRequest) {
  if (input.body.byteLength > 16 * 1024) {
    throw new NetworkIngestError("body_too_large", 413);
  }
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const credential = await findCredential(tx, input.headers, now);
    if (!credential) throw new NetworkIngestError("credential_not_found", 401);
    const secret = decryptSecret(credential.secretCiphertext).value;
    const verified = verifyNetworkRequestSignature({
      method: input.method,
      path: input.path,
      allowedPath: NETWORK_PULL_PATH,
      headers: input.headers,
      body: input.body,
      secret,
      nowSeconds: Math.floor(now.getTime() / 1000),
      clockSkewSeconds: NETWORK_CLOCK_SKEW_SECONDS,
    });
    if (!verified.ok) throw new NetworkIngestError(`signature_${verified.code}`, 401);
    const [nonce] = await tx
      .insert(networkMeasurementIngestNonces)
      .values({
        credentialId: credential.id,
        nonce: input.headers.nonce,
        requestTimestamp: new Date(Number(input.headers.requestTimestamp) * 1000),
        expiresAt: new Date(
          now.getTime() + (NETWORK_CLOCK_SKEW_SECONDS + 7 * 24 * 60 * 60) * 1000,
        ),
      })
      .onConflictDoNothing()
      .returning();
    if (!nonce) throw new NetworkIngestError("nonce_replayed", 409);

    const runs = await tx
      .select({
        id: networkMeasurementRuns.id,
        attempts: networkMeasurementRuns.attempts,
        runGeneration: networkMeasurementRuns.runGeneration,
        campaignId: networkMeasurementRuns.campaignId,
        candidateId: networkMeasurementCampaigns.candidateId,
        campaignRevisionId: networkMeasurementRuns.campaignRevisionId,
        protocolVersion: networkMeasurementCampaignRevisions.protocolVersion,
        probeSelector: networkMeasurementCampaignRevisions.probeSelector,
        metricProfile: networkMeasurementCampaignRevisions.metricProfile,
      })
      .from(networkMeasurementRuns)
      .innerJoin(
        networkMeasurementCampaigns,
        eq(networkMeasurementCampaigns.id, networkMeasurementRuns.campaignId),
      )
      .innerJoin(
        networkMeasurementCampaignRevisions,
        eq(
          networkMeasurementCampaignRevisions.id,
          networkMeasurementRuns.campaignRevisionId,
        ),
      )
      .where(
        and(
          eq(networkMeasurementRuns.status, "queued"),
          eq(networkMeasurementCampaigns.status, "active"),
          eq(
            networkMeasurementRuns.runGeneration,
            networkMeasurementCampaigns.runGeneration,
          ),
          lte(networkMeasurementRuns.slotAt, now),
        ),
      )
      .orderBy(asc(networkMeasurementRuns.slotAt))
      .limit(50);
    if (runs.length === 0) return { task: null };

    let run: (typeof runs)[number] | null = null;
    if (credential.probeId) {
      const [probeRevision] = await tx
        .select({
          countryCode: networkMeasurementProbeRevisions.countryCode,
          regionCode: networkMeasurementProbeRevisions.regionCode,
          carrier: networkMeasurementProbeRevisions.carrier,
          accessType: networkMeasurementProbeRevisions.accessType,
          asn: networkMeasurementProbeRevisions.asn,
          capabilities: networkMeasurementProbeRevisions.capabilities,
          trustLevel: networkMeasurementProbeRevisions.trustLevel,
          ownerOrgKey: networkMeasurementProbeRevisions.ownerOrgKey,
          independenceKey: networkMeasurementProbeRevisions.independenceKey,
        })
        .from(networkMeasurementProbeRevisions)
        .innerJoin(
          networkMeasurementProbes,
          eq(
            networkMeasurementProbes.currentConfigurationRevisionId,
            networkMeasurementProbeRevisions.id,
          ),
        )
        .where(eq(networkMeasurementProbes.id, credential.probeId))
        .limit(1);
      if (probeRevision) {
        run =
          runs.find((candidate) =>
            matchesProbeSelector(candidate.probeSelector, probeRevision),
          ) ?? null;
      }
    } else {
      run = runs[0] ?? null;
    }
    if (!run) return { task: null };

    const targetConditions = and(
      eq(networkMeasurementTargets.candidateId, run.candidateId),
      eq(networkMeasurementTargets.enabled, true),
    );
    const targets = credential.targetAgentId
      ? await tx
          .select({
            targetRevisionId: networkMeasurementTargetRevisions.id,
            addressFamily: networkMeasurementTargetRevisions.addressFamily,
            targetAddress: networkMeasurementTargetRevisions.targetAddress,
            targetPrefix: networkMeasurementTargetRevisions.targetPrefix,
            port: networkMeasurementTargetRevisions.port,
          })
          .from(networkMeasurementTargets)
          .innerJoin(
            networkMeasurementTargetRevisions,
            eq(
              networkMeasurementTargetRevisions.id,
              networkMeasurementTargets.currentConfigurationRevisionId,
            ),
          )
          .innerJoin(
            networkTargetAgentRevisions,
            eq(
              networkTargetAgentRevisions.id,
              networkMeasurementTargetRevisions.targetAgentRevisionId,
            ),
          )
          .where(
            and(
              targetConditions,
              eq(
                networkTargetAgentRevisions.targetAgentId,
                credential.targetAgentId,
              ),
            ),
          )
      : await tx
          .select({
            targetRevisionId: networkMeasurementTargetRevisions.id,
            addressFamily: networkMeasurementTargetRevisions.addressFamily,
            targetAddress: networkMeasurementTargetRevisions.targetAddress,
            targetPrefix: networkMeasurementTargetRevisions.targetPrefix,
            port: networkMeasurementTargetRevisions.port,
          })
          .from(networkMeasurementTargets)
          .innerJoin(
            networkMeasurementTargetRevisions,
            eq(
              networkMeasurementTargetRevisions.id,
              networkMeasurementTargets.currentConfigurationRevisionId,
            ),
          )
          .where(targetConditions);
    if (targets.length === 0) throw new NetworkIngestError("target_allowlist_empty", 409);

    const issuedAt = Math.floor(now.getTime() / 1000);
    const expiresAt = issuedAt + 5 * 60;
    const taskId = `run-${run.id}-${run.runGeneration}`;
    const payload = Buffer.from(
      JSON.stringify({
        version: 1,
        taskId,
        runId: run.id,
        runGeneration: run.runGeneration,
        campaignId: run.campaignId,
        campaignRevisionId: run.campaignRevisionId,
        candidateId: run.candidateId,
        protocolVersion: run.protocolVersion,
        probeSelector: run.probeSelector,
        metricProfile: run.metricProfile,
        targets,
      }),
      "utf8",
    );
    const signed = signNetworkTask({
      principalKind: credential.principalKind,
      principalExternalId: credential.principalExternalId,
      keyId: credential.keyId,
      taskId,
      issuedAt,
      expiresAt,
      payload,
      secret,
    });
    const [claimed] = await tx
      .update(networkMeasurementRuns)
      .set({
        status: "running",
        attempts: run.attempts + 1,
        startedAt: now,
        externalMeasurementId: taskId,
      })
      .where(
        and(
          eq(networkMeasurementRuns.id, run.id),
          eq(networkMeasurementRuns.status, "queued"),
          eq(networkMeasurementRuns.runGeneration, run.runGeneration),
        ),
      )
      .returning({ id: networkMeasurementRuns.id });
    if (!claimed) return { task: null };
    return {
      task: {
        version: 1,
        principalKind: credential.principalKind,
        principalExternalId: credential.principalExternalId,
        keyId: credential.keyId,
        taskId,
        issuedAt,
        expiresAt,
        nonce: signed.nonce,
        payload: payload.toString("base64url"),
        signature: signed.signature,
      },
    };
  });
}
