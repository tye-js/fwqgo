import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";

import {
  calculateMonthlyPriceUsd,
  getServerOfferTermMonths,
  normalizeServerOfferBillingCycle,
} from "@fwqgo/core/server-offer-price";
import { slugify } from "@fwqgo/core/utils";
import { getMissingOfferTransition } from "@fwqgo/core/provider-offer-sync";
import { db } from "@fwqgo/db";
import {
  affServiceProviders,
  providerOfferCandidates,
  providerMonitors,
  serverOfferPrices,
  serverOfferSources,
  serverOffers,
} from "@fwqgo/db/schema";
import {
  applyProviderAffiliateUrl,
  type ProviderOfferCandidate,
} from "@/server/offers/provider-source-parser";
import { notifyPublicWebCache } from "@/server/cache/public-revalidation-client";

export type ProviderSyncContext = {
  monitorId: number;
  providerId: number;
  providerName: string;
  providerSlug: string | null;
  purpose: string;
  autoPublish: boolean;
  missingThreshold: number;
  affUrl: string;
  affParam: string;
  affValue: string;
  defaultPromoCode: string | null;
};

type StoredPrice = {
  amount: string;
  originalAmount: string | null;
  currency: string;
  billingCycle: string;
  termMonths: number;
  monthlyPriceUsd: number;
  purchaseUrl: string | null;
};

function parseNumberWithUnit(value: string | null, unit: "mb" | "gbps") {
  if (!value) return null;
  const match = /(\d+(?:\.\d+)?)\s*(tb|gb|mb|gbps|mbps)?/i.exec(value);
  if (!match?.[1]) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const suffix = match[2]?.toLowerCase();
  if (unit === "mb") {
    if (suffix === "tb") return Math.round(amount * 1024 * 1024);
    if (suffix === "gb") return Math.round(amount * 1024);
    return Math.round(amount);
  }
  if (suffix === "gbps") return Math.round(amount * 1_000);
  return Math.round(amount);
}

function normalizedPrices(
  candidate: ProviderOfferCandidate,
  context: ProviderSyncContext,
) {
  return candidate.prices
    .map<StoredPrice | null>((price) => {
      const billingCycle = normalizeServerOfferBillingCycle(price.billingCycle);
      const currency = price.currency.trim().toUpperCase() || "USD";
      const monthlyPriceUsd = calculateMonthlyPriceUsd({
        amount: price.amount,
        currency,
        billingCycle,
      });
      if (monthlyPriceUsd === null) return null;
      const rawPurchaseUrl = price.purchaseUrl ?? candidate.purchaseUrl;
      return {
        amount: price.amount,
        originalAmount: price.originalAmount,
        currency,
        billingCycle,
        termMonths: getServerOfferTermMonths(billingCycle),
        monthlyPriceUsd,
        purchaseUrl: rawPurchaseUrl
          ? applyProviderAffiliateUrl(rawPurchaseUrl, context)
          : null,
      };
    })
    .filter((price): price is StoredPrice => Boolean(price))
    .sort((left, right) => left.monthlyPriceUsd - right.monthlyPriceUsd);
}

function offerSlug(
  context: ProviderSyncContext,
  candidate: ProviderOfferCandidate,
) {
  const providerPart =
    context.providerSlug?.trim() ?? slugify(context.providerName);
  const normalizedTitle = slugify(candidate.title).slice(0, 80);
  const titlePart = normalizedTitle ? normalizedTitle : "server-offer";
  const identity = createHash("sha256")
    .update(`${context.providerId}:${candidate.externalProductId}`)
    .digest("hex")
    .slice(0, 10);
  return `${providerPart}-${titlePart}-${identity}`.slice(0, 360);
}

function diffValues(
  existing: Record<string, unknown>,
  candidate: ProviderOfferCandidate,
) {
  const candidateValues: Record<string, unknown> = {
    title: candidate.title,
    productGroup: candidate.productGroup,
    productType: candidate.productType,
    cpu: candidate.cpu,
    memory: candidate.memory,
    storage: candidate.storage,
    bandwidth: candidate.bandwidth,
    traffic: candidate.traffic,
    region: candidate.region,
    countryCode: candidate.countryCode,
    city: candidate.city,
    lineType: candidate.lineType,
    network: candidate.network,
    ipv4: candidate.ipv4,
    ipv6: candidate.ipv6,
    status: candidate.status,
  };
  return Object.fromEntries(
    Object.entries(candidateValues)
      .filter(([key, value]) => existing[key] !== value)
      .map(([key, value]) => [
        key,
        { before: existing[key] ?? null, after: value },
      ]),
  );
}

async function upsertSource(input: {
  offerId: number;
  context: ProviderSyncContext;
  candidate: ProviderOfferCandidate;
  now: Date;
}) {
  const [existing] = await db
    .select({ id: serverOfferSources.id })
    .from(serverOfferSources)
    .where(
      and(
        eq(serverOfferSources.offerId, input.offerId),
        eq(serverOfferSources.sourceType, "provider"),
        eq(serverOfferSources.externalId, input.candidate.externalProductId),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(serverOfferSources)
      .set({ sourceUrl: input.candidate.sourceUrl, updatedAt: input.now })
      .where(eq(serverOfferSources.id, existing.id));
    return;
  }
  await db.insert(serverOfferSources).values({
    offerId: input.offerId,
    sourceType: "provider",
    sourceUrl: input.candidate.sourceUrl,
    externalId: input.candidate.externalProductId,
    priority: 30,
  });
}

async function replacePrices(
  offerId: number,
  prices: StoredPrice[],
  now: Date,
) {
  await db
    .update(serverOfferPrices)
    .set({ active: false, updatedAt: now })
    .where(eq(serverOfferPrices.offerId, offerId));
  for (const price of prices) {
    await db
      .insert(serverOfferPrices)
      .values({
        offerId,
        billingCycle: price.billingCycle,
        termMonths: price.termMonths,
        amount: price.amount,
        originalAmount: price.originalAmount,
        currency: price.currency,
        monthlyPriceUsd: String(price.monthlyPriceUsd),
        purchaseUrl: price.purchaseUrl,
        active: true,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          serverOfferPrices.offerId,
          serverOfferPrices.billingCycle,
          serverOfferPrices.currency,
        ],
        set: {
          termMonths: price.termMonths,
          amount: price.amount,
          originalAmount: price.originalAmount,
          monthlyPriceUsd: String(price.monthlyPriceUsd),
          purchaseUrl: price.purchaseUrl,
          active: true,
          updatedAt: now,
        },
      });
  }
}

async function materializeOffer(input: {
  context: ProviderSyncContext;
  candidate: ProviderOfferCandidate;
  sourceHash: string;
  now: Date;
  existingOfferId?: number;
}) {
  const { candidate, context, sourceHash, now } = input;
  const prices = normalizedPrices(candidate, context);
  if (prices.length === 0) throw new Error("套餐价格无法折算为美元月价");
  const primaryPrice = prices[0]!;
  const purchaseUrl = applyProviderAffiliateUrl(candidate.purchaseUrl, context);
  const [existing] = input.existingOfferId
    ? await db
        .select()
        .from(serverOffers)
        .where(eq(serverOffers.id, input.existingOfferId))
        .limit(1)
    : [];
  const locked = new Set(existing?.lockedFields ?? []);
  const keepSpecs = locked.has("specs") && Boolean(existing);
  const keepLocation = locked.has("location") && Boolean(existing);
  const commonValues = {
    sourceMonitorId: context.monitorId,
    sourceHash,
    sourceLastSeenAt: now,
    missingRuns: 0,
    lastCheckedAt: now,
    checkStatus: "ok",
    updatedAt: now,
  } satisfies Partial<typeof serverOffers.$inferInsert>;
  const syncedValues = {
    offerKind:
      locked.has("offerKind") && existing
        ? existing.offerKind
        : context.purpose === "promotion"
          ? "promotion"
          : "regular",
    title: locked.has("title") && existing ? existing.title : candidate.title,
    productGroup: keepSpecs ? existing?.productGroup : candidate.productGroup,
    productType: keepSpecs ? existing?.productType : candidate.productType,
    cpu: keepSpecs ? existing?.cpu : candidate.cpu,
    memory: keepSpecs ? existing?.memory : candidate.memory,
    memoryMb: keepSpecs
      ? existing?.memoryMb
      : parseNumberWithUnit(candidate.memory, "mb"),
    storage: keepSpecs ? existing?.storage : candidate.storage,
    storageGb: keepSpecs
      ? existing?.storageGb
      : candidate.storage
        ? Math.round(
            (parseNumberWithUnit(candidate.storage, "mb") ?? 0) / 1024,
          ) || null
        : null,
    bandwidth: keepSpecs ? existing?.bandwidth : candidate.bandwidth,
    bandwidthMbps: keepSpecs
      ? existing?.bandwidthMbps
      : parseNumberWithUnit(candidate.bandwidth, "gbps"),
    traffic: keepSpecs ? existing?.traffic : candidate.traffic,
    trafficGb: keepSpecs
      ? existing?.trafficGb
      : candidate.traffic
        ? Math.round(
            (parseNumberWithUnit(candidate.traffic, "mb") ?? 0) / 1024,
          ) || null
        : null,
    region: keepLocation ? existing?.region : candidate.region,
    countryCode: keepLocation ? existing?.countryCode : candidate.countryCode,
    city: keepLocation ? existing?.city : candidate.city,
    lineType: keepLocation ? existing?.lineType : candidate.lineType,
    network: keepLocation ? existing?.network : candidate.network,
    ipv4: keepLocation ? existing?.ipv4 : candidate.ipv4,
    ipv6: keepLocation ? existing?.ipv6 : candidate.ipv6,
    status:
      locked.has("status") && existing ? existing.status : candidate.status,
    priceAmount:
      locked.has("price") && existing
        ? existing.priceAmount
        : primaryPrice.amount,
    originalPriceAmount:
      locked.has("price") && existing
        ? existing.originalPriceAmount
        : primaryPrice.originalAmount,
    currency:
      locked.has("price") && existing
        ? existing.currency
        : primaryPrice.currency,
    billingCycle:
      locked.has("price") && existing
        ? existing.billingCycle
        : primaryPrice.billingCycle,
    monthlyPriceUsd:
      locked.has("price") && existing
        ? existing.monthlyPriceUsd
        : String(primaryPrice.monthlyPriceUsd),
    purchaseUrl:
      locked.has("purchaseUrl") && existing
        ? existing.purchaseUrl
        : purchaseUrl,
    promoCode:
      locked.has("promoCode") && existing
        ? existing.promoCode
        : candidate.promoCode ?? context.defaultPromoCode,
  } satisfies Partial<typeof serverOffers.$inferInsert>;

  const offerId = existing
    ? (
        await db
          .update(serverOffers)
          .set({ ...syncedValues, ...commonValues })
          .where(eq(serverOffers.id, existing.id))
          .returning({ id: serverOffers.id })
      )[0]?.id
    : (
        await db
          .insert(serverOffers)
          .values({
            ...syncedValues,
            ...commonValues,
            slug: offerSlug(context, candidate),
            externalProductId: candidate.externalProductId,
            providerId: context.providerId,
            providerName: context.providerName,
            reviewStatus: "reviewed",
            reviewedAt: now,
            visible: true,
            rawText: JSON.stringify(candidate.raw).slice(0, 20_000),
            createdAt: now,
          })
          .returning({ id: serverOffers.id })
      )[0]?.id;
  if (!offerId) throw new Error("供应商套餐写入失败");
  if (!locked.has("price")) await replacePrices(offerId, prices, now);
  await upsertSource({ offerId, context, candidate, now });
  return offerId;
}

async function upsertCandidateRecord(input: {
  context: ProviderSyncContext;
  candidate: ProviderOfferCandidate;
  sourceHash: string;
  status: "pending" | "accepted" | "rejected" | "superseded";
  offerId: number | null;
  diff: Record<string, unknown> | null;
  now: Date;
}) {
  const [existing] = await db
    .select()
    .from(providerOfferCandidates)
    .where(
      and(
        eq(providerOfferCandidates.monitorId, input.context.monitorId),
        eq(
          providerOfferCandidates.externalProductId,
          input.candidate.externalProductId,
        ),
      ),
    )
    .limit(1);
  const sameRejected =
    existing?.status === "rejected" && existing.sourceHash === input.sourceHash;
  const nextStatus = sameRejected ? "rejected" : input.status;
  if (existing) {
    await db
      .update(providerOfferCandidates)
      .set({
        sourceUrl: input.candidate.sourceUrl,
        sourceHash: input.sourceHash,
        normalizedData: input.candidate,
        diff: input.diff,
        status: nextStatus,
        offerId: input.offerId,
        rejectionReason: sameRejected ? existing.rejectionReason : null,
        reviewedAt: sameRejected ? existing.reviewedAt : null,
        reviewedBy: sameRejected ? existing.reviewedBy : null,
        lastSeenAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(providerOfferCandidates.id, existing.id));
    return { id: existing.id, status: nextStatus, sameRejected };
  }
  const [created] = await db
    .insert(providerOfferCandidates)
    .values({
      monitorId: input.context.monitorId,
      providerId: input.context.providerId,
      externalProductId: input.candidate.externalProductId,
      sourceUrl: input.candidate.sourceUrl,
      sourceHash: input.sourceHash,
      normalizedData: input.candidate,
      diff: input.diff,
      status: nextStatus,
      offerId: input.offerId,
      firstSeenAt: input.now,
      lastSeenAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning({ id: providerOfferCandidates.id });
  if (!created) throw new Error("供应商套餐候选写入失败");
  return { id: created.id, status: nextStatus, sameRejected };
}

export async function syncProviderOfferCandidate(input: {
  context: ProviderSyncContext;
  candidate: ProviderOfferCandidate;
  sourceHash: string;
  now: Date;
}) {
  const [existingOffer] = await db
    .select()
    .from(serverOffers)
    .where(
      and(
        eq(serverOffers.providerId, input.context.providerId),
        eq(serverOffers.externalProductId, input.candidate.externalProductId),
      ),
    )
    .limit(1);

  if (existingOffer) {
    const diff = diffValues(existingOffer, input.candidate);
    if (existingOffer.sourceHash === input.sourceHash) {
      await db
        .update(serverOffers)
        .set({
          sourceMonitorId: input.context.monitorId,
          sourceLastSeenAt: input.now,
          missingRuns: 0,
          lastCheckedAt: input.now,
          checkStatus: "ok",
        })
        .where(eq(serverOffers.id, existingOffer.id));
      await upsertCandidateRecord({
        ...input,
        status: "accepted",
        offerId: existingOffer.id,
        diff,
      });
      return { outcome: "unchanged" as const, offerId: existingOffer.id };
    }
    const offerId = await materializeOffer({
      ...input,
      existingOfferId: existingOffer.id,
    });
    await upsertCandidateRecord({
      ...input,
      status: "accepted",
      offerId,
      diff,
    });
    return { outcome: "updated" as const, offerId };
  }

  if (!input.context.autoPublish) {
    const candidateRecord = await upsertCandidateRecord({
      ...input,
      status: "pending",
      offerId: null,
      diff: null,
    });
    return {
      outcome:
        candidateRecord.status === "rejected"
          ? ("unchanged" as const)
          : ("pending" as const),
      offerId: null,
    };
  }

  const offerId = await materializeOffer(input);
  await upsertCandidateRecord({
    ...input,
    status: "accepted",
    offerId,
    diff: null,
  });
  return { outcome: "created" as const, offerId };
}

export async function markMissingProviderOffers(input: {
  context: ProviderSyncContext;
  seenExternalIds: Set<string>;
  now: Date;
}) {
  const offers = await db
    .select({
      id: serverOffers.id,
      externalProductId: serverOffers.externalProductId,
      missingRuns: serverOffers.missingRuns,
      status: serverOffers.status,
      lockedFields: serverOffers.lockedFields,
    })
    .from(serverOffers)
    .where(eq(serverOffers.sourceMonitorId, input.context.monitorId));
  let missing = 0;
  for (const offer of offers) {
    if (
      offer.externalProductId &&
      input.seenExternalIds.has(offer.externalProductId)
    ) {
      continue;
    }
    missing += 1;
    const transition = getMissingOfferTransition({
      missingRuns: offer.missingRuns,
      threshold: input.context.missingThreshold,
      status: offer.status,
      statusLocked: (offer.lockedFields ?? []).includes("status"),
    });
    await db
      .update(serverOffers)
      .set({
        missingRuns: transition.missingRuns,
        status: transition.status,
        statusChangedAt:
          transition.statusChanged ? input.now : undefined,
        updatedAt: transition.statusChanged ? input.now : undefined,
      })
      .where(eq(serverOffers.id, offer.id));
  }
  return missing;
}

export async function acceptProviderOfferCandidate(input: {
  candidateId: number;
  reviewerId: string;
}) {
  const [row] = await db
    .select({
      candidate: providerOfferCandidates,
    })
    .from(providerOfferCandidates)
    .where(eq(providerOfferCandidates.id, input.candidateId))
    .limit(1);
  if (!row) throw new Error("供应商套餐候选不存在");
  const [contextRow] = await db
    .select({
      monitorId: providerMonitors.id,
      providerId: providerMonitors.providerId,
      purpose: providerMonitors.purpose,
      autoPublish: providerMonitors.autoPublish,
      missingThreshold: providerMonitors.missingThreshold,
      providerName: affServiceProviders.name,
      providerSlug: affServiceProviders.slug,
      affUrl: affServiceProviders.affUrl,
      affParam: affServiceProviders.affParam,
      affValue: affServiceProviders.affValue,
      defaultPromoCode: affServiceProviders.defaultPromoCode,
    })
    .from(providerMonitors)
    .innerJoin(
      affServiceProviders,
      eq(providerMonitors.providerId, affServiceProviders.id),
    )
    .where(eq(providerMonitors.id, row.candidate.monitorId))
    .limit(1);
  if (!contextRow) throw new Error("供应商采集源不存在");
  const candidate = row.candidate
    .normalizedData as unknown as ProviderOfferCandidate;
  const [existingOffer] = await db
    .select({ id: serverOffers.id })
    .from(serverOffers)
    .where(
      and(
        eq(serverOffers.providerId, contextRow.providerId),
        eq(serverOffers.externalProductId, candidate.externalProductId),
      ),
    )
    .limit(1);
  const offerId = await materializeOffer({
    context: contextRow,
    candidate,
    sourceHash: row.candidate.sourceHash,
    now: new Date(),
    existingOfferId: row.candidate.offerId ?? existingOffer?.id ?? undefined,
  });
  await db
    .update(providerOfferCandidates)
    .set({
      status: "accepted",
      offerId,
      reviewedBy: input.reviewerId,
      reviewedAt: new Date(),
      rejectionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(providerOfferCandidates.id, input.candidateId));
  await notifyPublicWebCache("offer.changed", {
    topicSlugs: ["hong-kong", "united-states", "cheap-vps"],
  });
  return { offerId };
}

export async function rejectProviderOfferCandidate(input: {
  candidateId: number;
  reviewerId: string;
  reason?: string;
}) {
  const [updated] = await db
    .update(providerOfferCandidates)
    .set({
      status: "rejected",
      reviewedBy: input.reviewerId,
      reviewedAt: new Date(),
      rejectionReason: input.reason?.trim()
        ? input.reason.trim()
        : "人工拒绝",
      updatedAt: new Date(),
    })
    .where(eq(providerOfferCandidates.id, input.candidateId))
    .returning({ id: providerOfferCandidates.id });
  if (!updated) throw new Error("供应商套餐候选不存在");
  return updated;
}
