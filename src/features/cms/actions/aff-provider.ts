"use server";

import { db } from "@fwqgo/db";
import { type AffManData } from "@/types";
import { revalidatePath } from "next/cache";
import { affServiceProviders } from "@fwqgo/db/schema";
import { eq, desc, inArray, count, or, ilike } from "drizzle-orm";
import { requireAdminSession } from "@fwqgo/auth/session";

type AffProviderActionResult =
  | { data: typeof affServiceProviders.$inferSelect | undefined }
  | { error: string; message: string };

type AffProviderDeleteActionResult =
  | { data: number | typeof affServiceProviders.$inferSelect | undefined }
  | { error: string; message: string };

const MAX_TEXT_LENGTH = 500;
const MAX_NAME_LENGTH = 80;
const MAX_PARAM_LENGTH = 80;

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
    return { error: `商家名不能超过 ${MAX_NAME_LENGTH} 个字符`, data: normalizedData };
  }

  if (
    normalizedData.affUrl.length > MAX_TEXT_LENGTH ||
    normalizedData.affValue.length > MAX_TEXT_LENGTH ||
    normalizedData.officialUrl.length > MAX_TEXT_LENGTH
  ) {
    return { error: `链接和返利值不能超过 ${MAX_TEXT_LENGTH} 个字符`, data: normalizedData };
  }

  if (normalizedData.affParam.length > MAX_PARAM_LENGTH) {
    return { error: `返利参数不能超过 ${MAX_PARAM_LENGTH} 个字符`, data: normalizedData };
  }

  try {
    const parsedUrl = new URL(normalizedData.affUrl);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return { error: "返利链接只支持 http 或 https", data: normalizedData };
    }
  } catch {
    return { error: "返利链接格式不正确，请填写完整 URL", data: normalizedData };
  }

  if (
    normalizedData.officialUrl.includes(" ") ||
    !normalizedData.officialUrl.includes(".")
  ) {
    return { error: "商家官网请填写域名，例如 example.com", data: normalizedData };
  }

  return { data: normalizedData };
}

// 通过href查询affServiceProvider
export async function getAffValueByHref(hostname: string) {
  try {
    // 生成子域名数组，但排除最后一个元素（顶级域名）
    const domainParts = hostname.split(".");
    const possibleDomains = domainParts
      .map((_, index, arr) => arr.slice(index).join("."))
      .filter((domain) => domain.includes(".")); // 确保至少包含一个点号
    const [result] = await db
      .select()
      .from(affServiceProviders)
      .where(inArray(affServiceProviders.officialUrl, possibleDomains))
      .limit(1);

    return { data: result ?? null };
  } catch (error) {
    return { error: "查询关联服务商失败", message: error };
  }
}

export async function getAffProviderList({
  page = 1,
  pageSize = 20,
  query = "",
}: {
  page?: number;
  pageSize?: number;
  query?: string;
}) {
  await requireAdminSession();

  const normalizedQuery = query.trim();
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const normalizedPageSize =
    Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20;
  const whereCondition = normalizedQuery
    ? or(
        ilike(affServiceProviders.name, `%${normalizedQuery}%`),
        ilike(affServiceProviders.officialUrl, `%${normalizedQuery}%`),
        ilike(affServiceProviders.affUrl, `%${normalizedQuery}%`),
      )
    : undefined;

  const result = whereCondition
    ? await db
        .select()
        .from(affServiceProviders)
        .where(whereCondition)
        .orderBy(desc(affServiceProviders.id))
        .offset((normalizedPage - 1) * normalizedPageSize)
        .limit(normalizedPageSize)
    : await db
        .select()
        .from(affServiceProviders)
        .orderBy(desc(affServiceProviders.id))
        .offset((normalizedPage - 1) * normalizedPageSize)
        .limit(normalizedPageSize);

  return { data: result };
}

export async function getAffProviderCount(query = "") {
  await requireAdminSession();

  const normalizedQuery = query.trim();
  const whereCondition = normalizedQuery
    ? or(
        ilike(affServiceProviders.name, `%${normalizedQuery}%`),
        ilike(affServiceProviders.officialUrl, `%${normalizedQuery}%`),
        ilike(affServiceProviders.affUrl, `%${normalizedQuery}%`),
      )
    : undefined;
  const [result] = whereCondition
    ? await db
        .select({ count: count() })
        .from(affServiceProviders)
        .where(whereCondition)
    : await db.select({ count: count() }).from(affServiceProviders);

  return { data: result?.count ?? 0 };
}

export async function updateAffProvider(
  data: AffManData,
): Promise<AffProviderActionResult> {
  try {
    await requireAdminSession();

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

    if (existingProvider && existingProvider.id !== data.id) {
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
      .where(eq(affServiceProviders.id, data.id))
      .returning();

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

    if (!Number.isInteger(id) || id <= 0) {
      return { error: "删除返利商家失败", message: "商家 ID 不正确" };
    }

    const [result] = await db
      .delete(affServiceProviders)
      .where(eq(affServiceProviders.id, id))
      .returning();

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

    const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);

    if (validIds.length === 0) {
      return { data: 0 };
    }

    const result = await db
      .delete(affServiceProviders)
      .where(inArray(affServiceProviders.id, validIds))
      .returning({ id: affServiceProviders.id });

    revalidatePath("/collect/aff-man");
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

    revalidatePath("/collect/aff-man");
    return { data: result };
  } catch (error) {
    console.error("新增返利商家失败:", error);
    return { error: "新增返利商家失败", message: getErrorMessage(error) };
  }
}
