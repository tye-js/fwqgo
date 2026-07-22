"use server";

import { db } from "@fwqgo/db";
import { type AffManData } from "@/types";
import { revalidatePath } from "next/cache";
import { affServiceProviders } from "@fwqgo/db/schema";
import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { requireAdminSession } from "@fwqgo/auth/session";
import { normalizeOffsetPagination } from "@fwqgo/core/pagination";
import { parsePostgresIntegerId } from "@fwqgo/core/utils";
import { ilikeContains } from "@/server/db/search";
import { clearOutboundAffiliateProviderCache } from "@/server/links/outbound-short-link";

type AffProviderActionResult =
  | { data: typeof affServiceProviders.$inferSelect }
  | { error: string; message: string };

type AffProviderDeleteActionResult =
  | { data: number | typeof affServiceProviders.$inferSelect }
  | { error: string; message: string };

const MAX_TEXT_LENGTH = 500;
const MAX_NAME_LENGTH = 80;
const MAX_PARAM_LENGTH = 80;

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
      ? sql`btrim(${affServiceProviders.affUrl}) <> ''`
      : filter === "empty-aff"
        ? sql`btrim(${affServiceProviders.affUrl}) = ''`
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

  if (
    !normalizedData.name ||
    !normalizedData.affUrl ||
    !normalizedData.affParam ||
    !normalizedData.affValue ||
    !normalizedData.officialUrl
  ) {
    return { error: "请填写完整信息", data: normalizedData };
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

  try {
    const parsedUrl = new URL(normalizedData.affUrl);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return { error: "返利链接只支持 http 或 https", data: normalizedData };
    }
  } catch {
    return {
      error: "返利链接格式不正确，请填写完整 URL",
      data: normalizedData,
    };
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
      .where(inArray(affServiceProviders.officialUrl, possibleDomains));
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

    const [result] = await db
      .delete(affServiceProviders)
      .where(eq(affServiceProviders.id, providerId))
      .returning();

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

    const result = await db
      .delete(affServiceProviders)
      .where(inArray(affServiceProviders.id, validIds))
      .returning({ id: affServiceProviders.id });

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
