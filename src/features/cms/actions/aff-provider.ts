"use server";

import { db } from "@fwqgo/db";
import { type AffManData } from "@/types";
import { revalidatePath } from "next/cache";
import {
  affServiceProviders,
  providerMonitors,
  serverOffers,
} from "@fwqgo/db/schema";
import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { requireAdminSession } from "@fwqgo/auth/session";
import { getAffiliateConfigState } from "@fwqgo/core/affiliate-provider";
import { normalizeOffsetPagination } from "@fwqgo/core/pagination";
import { parsePostgresIntegerId } from "@fwqgo/core/utils";
import { ilikeContains } from "@/server/db/search";
import { clearOutboundAffiliateProviderCache } from "@/server/links/outbound-short-link";

type AffProviderActionResult =
  | { data: typeof affServiceProviders.$inferSelect }
  | { error: string; message: string };

type AffProviderDeleteActionResult =
  | { data: number }
  | { error: string; message: string };

const MAX_TEXT_LENGTH = 500;
const MAX_NAME_LENGTH = 80;
const MAX_PARAM_LENGTH = 80;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AffProviderFilter = "all" | "with-aff" | "empty-aff";
export type AffProviderSort =
  | "id-desc"
  | "id-asc"
  | "name-asc"
  | "officialUrl-asc";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? `；原因：${error.cause.message}`
        : typeof error.cause === "string"
          ? `；原因：${error.cause}`
          : "";

    return `${error.message}${cause}`;
  }

  return typeof error === "string" ? error : "未知错误";
}

function normalizeText(value: string) {
  return value.trim();
}

function normalizeOfficialUrl(value: string) {
  const trimmedValue = normalizeText(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

  return trimmedValue;
}

function normalizeAffUrl(value: string) {
  return normalizeText(value);
}

function normalizeAffProviderFilter(value: string): AffProviderFilter {
  return value === "with-aff" || value === "empty-aff" ? value : "all";
}

function normalizeAffProviderSort(value: string): AffProviderSort {
  return value === "id-asc" ||
    value === "name-asc" ||
    value === "officialUrl-asc"
    ? value
    : "id-desc";
}

function normalizeHostnameInput(value: string) {
  const normalizedValue = value.trim();
  if (!normalizedValue) return null;

  try {
    const parsedUrl = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(normalizedValue)
        ? normalizedValue
        : `http://${normalizedValue}`,
    );

    if (!parsedUrl.hostname) return null;
    return parsedUrl.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function getCandidateDomains(value: string) {
  const hostname = normalizeHostnameInput(value);
  if (!hostname?.includes(".")) return [];

  const domainParts = hostname.split(".").filter(Boolean);
  return domainParts
    .map((_, index) => domainParts.slice(index).join("."))
    .filter((domain) => domain.includes("."));
}

function getAffProviderWhereCondition({
  query,
  filter,
}: {
  query: string;
  filter: AffProviderFilter;
}) {
  const searchCondition = query
    ? or(
        ilikeContains(affServiceProviders.name, query),
        ilikeContains(affServiceProviders.officialUrl, query),
        ilikeContains(affServiceProviders.affUrl, query),
      )
    : undefined;
  const filterCondition =
    filter === "with-aff"
      ? and(
          sql`btrim(${affServiceProviders.affUrl}) <> ''`,
          sql`btrim(${affServiceProviders.affParam}) <> ''`,
          sql`btrim(${affServiceProviders.affValue}) <> ''`,
        )
      : filter === "empty-aff"
        ? or(
            sql`btrim(${affServiceProviders.affUrl}) = ''`,
            sql`btrim(${affServiceProviders.affParam}) = ''`,
            sql`btrim(${affServiceProviders.affValue}) = ''`,
          )
        : undefined;

  return and(searchCondition, filterCondition);
}

function validateAffProviderInput(data: Omit<AffManData, "id">) {
  const normalizedData = {
    name: normalizeText(data.name),
    affUrl: normalizeAffUrl(data.affUrl),
    affParam: normalizeText(data.affParam),
    affValue: normalizeText(data.affValue),
    officialUrl: normalizeOfficialUrl(data.officialUrl),
  };

  if (!normalizedData.name || !normalizedData.officialUrl) {
    return { error: "请填写商家名和官网域名", data: normalizedData };
  }

  const affiliateConfigState = getAffiliateConfigState(normalizedData);
  if (affiliateConfigState === "partial") {
    return {
      error: "返利链接、返利参数和返利值需全部填写，或全部留空",
      data: normalizedData,
    };
  }

  if (normalizedData.name.length > MAX_NAME_LENGTH) {
    return {
      error: `商家名不能超过 ${MAX_NAME_LENGTH} 个字符`,
      data: normalizedData,
    };
  }

  if (
    normalizedData.affUrl.length > MAX_TEXT_LENGTH ||
    normalizedData.affValue.length > MAX_TEXT_LENGTH ||
    normalizedData.officialUrl.length > MAX_TEXT_LENGTH
  ) {
    return {
      error: `链接和返利值不能超过 ${MAX_TEXT_LENGTH} 个字符`,
      data: normalizedData,
    };
  }

  if (normalizedData.affParam.length > MAX_PARAM_LENGTH) {
    return {
      error: `返利参数不能超过 ${MAX_PARAM_LENGTH} 个字符`,
      data: normalizedData,
    };
  }

  if (affiliateConfigState === "complete") {
    try {
      const parsedUrl = new URL(normalizedData.affUrl);

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return {
          error: "返利链接只支持 http 或 https",
          data: normalizedData,
        };
      }
    } catch {
      return {
        error: "返利链接格式不正确，请填写完整 URL",
        data: normalizedData,
      };
    }
  }

  if (
    normalizedData.officialUrl.includes(" ") ||
    !normalizedData.officialUrl.includes(".")
  ) {
    return {
      error: "商家官网请填写域名，例如 example.com",
      data: normalizedData,
    };
  }

  return { data: normalizedData };
}

async function assertProvidersCanBeDeleted(
  tx: DbTransaction,
  providers: Array<{ id: number; name: string }>,
) {
  const providerIds = providers.map((provider) => provider.id);
  const monitorReferences = await tx
    .select({
      providerId: providerMonitors.providerId,
      count: count(),
    })
    .from(providerMonitors)
    .where(inArray(providerMonitors.providerId, providerIds))
    .groupBy(providerMonitors.providerId);
  const offerReferences = await tx
    .select({
      providerId: serverOffers.providerId,
      count: count(),
    })
    .from(serverOffers)
    .where(inArray(serverOffers.providerId, providerIds))
    .groupBy(serverOffers.providerId);
  const monitorCountByProvider = new Map(
    monitorReferences.map((reference) => [
      reference.providerId,
      reference.count,
    ]),
  );
  const offerCountByProvider = new Map(
    offerReferences.map((reference) => [reference.providerId, reference.count]),
  );
  const blockers = providers.flatMap((provider) => {
    const monitorCount = monitorCountByProvider.get(provider.id) ?? 0;
    const offerCount = offerCountByProvider.get(provider.id) ?? 0;
    if (monitorCount === 0 && offerCount === 0) return [];
    return [{ ...provider, monitorCount, offerCount }];
  });

  if (blockers.length === 0) return;

  const details = blockers
    .slice(0, 5)
    .map(
      (provider) =>
        `${provider.name}（采集监控 ${provider.monitorCount}，套餐 ${provider.offerCount}）`,
    )
    .join("；");
  const omitted = blockers.length > 5 ? `；另有 ${blockers.length - 5} 个` : "";
  throw new Error(
    `仍有关联数据，不能删除：${details}${omitted}。请先删除或迁移采集监控，并解除套餐关联。`,
  );
}

// 通过href查询affServiceProvider
export async function getAffValueByHref(hostname: string) {
  try {
    await requireAdminSession();

    const possibleDomains = getCandidateDomains(hostname);
    if (possibleDomains.length === 0) {
      return { data: null };
    }

    const matches = await db
      .select()
      .from(affServiceProviders)
      .where(
        and(
          inArray(affServiceProviders.officialUrl, possibleDomains),
          sql`btrim(${affServiceProviders.affUrl}) <> ''`,
          sql`btrim(${affServiceProviders.affParam}) <> ''`,
          sql`btrim(${affServiceProviders.affValue}) <> ''`,
        ),
      );
    const matchesByDomain = new Map(
      matches.map((provider) => [
        normalizeOfficialUrl(provider.officialUrl),
        provider,
      ]),
    );
    const result = possibleDomains
      .map((domain) => matchesByDomain.get(domain))
      .find((provider) => provider !== undefined);

    return { data: result ?? null };
  } catch (error) {
    return {
      error: "查询关联服务商失败",
      message: getErrorMessage(error),
    };
  }
}

export async function getAffProviderList({
  page = 1,
  pageSize = 20,
  query = "",
  filter = "all",
  sort = "id-desc",
}: {
  page?: number;
  pageSize?: number;
  query?: string;
  filter?: string;
  sort?: string;
}) {
  await requireAdminSession();

  const normalizedQuery = query.trim().slice(0, 160);
  const pagination = normalizeOffsetPagination({ pageNo: page, pageSize });
  const normalizedFilter = normalizeAffProviderFilter(filter);
  const normalizedSort = normalizeAffProviderSort(sort);
  const whereCondition = getAffProviderWhereCondition({
    query: normalizedQuery,
    filter: normalizedFilter,
  });
  const orderBy =
    normalizedSort === "id-asc"
      ? asc(affServiceProviders.id)
      : normalizedSort === "name-asc"
        ? asc(affServiceProviders.name)
        : normalizedSort === "officialUrl-asc"
          ? asc(affServiceProviders.officialUrl)
          : desc(affServiceProviders.id);

  const result = await db
    .select()
    .from(affServiceProviders)
    .where(whereCondition)
    .orderBy(orderBy)
    .offset(pagination.offset)
    .limit(pagination.pageSize);

  return { data: result };
}

export async function getAffProviderCount({
  query = "",
  filter = "all",
}: {
  query?: string;
  filter?: string;
} = {}) {
  await requireAdminSession();

  const normalizedQuery = query.trim().slice(0, 160);
  const whereCondition = getAffProviderWhereCondition({
    query: normalizedQuery,
    filter: normalizeAffProviderFilter(filter),
  });
  const [result] = await db
    .select({ count: count() })
    .from(affServiceProviders)
    .where(whereCondition);

  return { data: result?.count ?? 0 };
}

export async function updateAffProvider(
  data: AffManData,
): Promise<AffProviderActionResult> {
  try {
    await requireAdminSession();
    const providerId = parsePostgresIntegerId(data.id);

    if (providerId === null) {
      return { error: "更新返利商家失败", message: "商家 ID 不正确" };
    }

    const validation = validateAffProviderInput(data);
    if (validation.error) {
      return { error: "更新返利商家失败", message: validation.error };
    }

    const normalizedData = validation.data;

    const [existingProvider] = await db
      .select({
        id: affServiceProviders.id,
        name: affServiceProviders.name,
        officialUrl: affServiceProviders.officialUrl,
      })
      .from(affServiceProviders)
      .where(
        or(
          eq(affServiceProviders.name, normalizedData.name),
          eq(affServiceProviders.officialUrl, normalizedData.officialUrl),
        ),
      )
      .limit(1);

    if (existingProvider && existingProvider.id !== providerId) {
      const duplicatedField =
        existingProvider.name === normalizedData.name ? "商家名" : "官网域名";

      return {
        error: "返利商家已存在",
        message: `${duplicatedField} 已存在：${existingProvider.name}（ID ${existingProvider.id}）`,
      };
    }

    const [result] = await db
      .update(affServiceProviders)
      .set({ ...normalizedData, updatedAt: new Date() })
      .where(eq(affServiceProviders.id, providerId))
      .returning();

    if (!result) {
      return {
        error: "更新返利商家失败",
        message: "商家不存在或已被删除，请刷新列表后重试",
      };
    }

    clearOutboundAffiliateProviderCache();
    revalidatePath("/collect/aff-man");
    return { data: result };
  } catch (error) {
    console.error("更新返利商家失败:", error);
    return { error: "更新返利商家失败", message: getErrorMessage(error) };
  }
}

export async function deleteAffProvider(
  id: number,
): Promise<AffProviderActionResult> {
  try {
    await requireAdminSession();
    const providerId = parsePostgresIntegerId(id);

    if (providerId === null) {
      return { error: "删除返利商家失败", message: "商家 ID 不正确" };
    }

    const result = await db.transaction(async (tx) => {
      const [provider] = await tx
        .select({
          id: affServiceProviders.id,
          name: affServiceProviders.name,
        })
        .from(affServiceProviders)
        .where(eq(affServiceProviders.id, providerId))
        .for("update")
        .limit(1);
      if (!provider) return null;

      await assertProvidersCanBeDeleted(tx, [provider]);
      const [deleted] = await tx
        .delete(affServiceProviders)
        .where(eq(affServiceProviders.id, providerId))
        .returning();
      return deleted ?? null;
    });

    if (!result) {
      return {
        error: "删除返利商家失败",
        message: "商家不存在或已被删除，请刷新列表后确认",
      };
    }

    clearOutboundAffiliateProviderCache();
    revalidatePath("/collect/aff-man");
    return { data: result };
  } catch (error) {
    console.error("删除返利商家失败:", error);
    return { error: "删除返利商家失败", message: getErrorMessage(error) };
  }
}

export async function deleteAffProviders(
  ids: number[],
): Promise<AffProviderDeleteActionResult> {
  try {
    await requireAdminSession();

    const validIds = [
      ...new Set(
        ids
          .map(parsePostgresIntegerId)
          .filter((id): id is number => id !== null),
      ),
    ].slice(0, 500);

    if (validIds.length === 0) {
      return { data: 0 };
    }

    const result = await db.transaction(async (tx) => {
      const providers = await tx
        .select({
          id: affServiceProviders.id,
          name: affServiceProviders.name,
        })
        .from(affServiceProviders)
        .where(inArray(affServiceProviders.id, validIds))
        .orderBy(asc(affServiceProviders.id))
        .for("update");
      if (providers.length !== validIds.length) {
        throw new Error(
          `所选供应商中有 ${validIds.length - providers.length} 个不存在，请刷新列表后重试。`,
        );
      }

      await assertProvidersCanBeDeleted(tx, providers);
      return tx
        .delete(affServiceProviders)
        .where(inArray(affServiceProviders.id, validIds))
        .returning({ id: affServiceProviders.id });
    });

    if (result.length > 0) {
      clearOutboundAffiliateProviderCache();
      revalidatePath("/collect/aff-man");
    }
    return { data: result.length };
  } catch (error) {
    console.error("批量删除返利商家失败:", error);
    return { error: "批量删除返利商家失败", message: getErrorMessage(error) };
  }
}

export async function addAffProvider(
  data: Omit<AffManData, "id">,
): Promise<AffProviderActionResult> {
  try {
    await requireAdminSession();

    const validation = validateAffProviderInput(data);
    if (validation.error) {
      return { error: "新增返利商家失败", message: validation.error };
    }

    const normalizedData = validation.data;

    const [existingProvider] = await db
      .select({
        id: affServiceProviders.id,
        name: affServiceProviders.name,
        officialUrl: affServiceProviders.officialUrl,
      })
      .from(affServiceProviders)
      .where(
        or(
          eq(affServiceProviders.name, normalizedData.name),
          eq(affServiceProviders.officialUrl, normalizedData.officialUrl),
        ),
      )
      .limit(1);

    if (existingProvider) {
      const duplicatedField =
        existingProvider.name === normalizedData.name ? "商家名" : "官网域名";

      return {
        error: "返利商家已存在",
        message: `${duplicatedField} 已存在：${existingProvider.name}（ID ${existingProvider.id}）`,
      };
    }

    const [result] = await db
      .insert(affServiceProviders)
      .values(normalizedData)
      .returning();

    if (!result) {
      return {
        error: "新增返利商家失败",
        message: "数据库没有返回新增记录，请刷新列表后确认",
      };
    }

    clearOutboundAffiliateProviderCache();
    revalidatePath("/collect/aff-man");
    return { data: result };
  } catch (error) {
    console.error("新增返利商家失败:", error);
    return { error: "新增返利商家失败", message: getErrorMessage(error) };
  }
}
