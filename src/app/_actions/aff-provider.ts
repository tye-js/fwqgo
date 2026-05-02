"use server";

import { db } from "@/server/db";
import { type AffManData } from "@/types";
import { revalidatePath } from "next/cache";
import { affServiceProviders } from "@/server/db/schema";
import { eq, desc, inArray, count } from "drizzle-orm";
// 通过href查询affServiceProvider
export async function getAffValueByHref(hostname: string) {
  try {
    // 生成子域名数组，但排除最后一个元素（顶级域名）
    const domainParts = hostname.split(".");
    const possibleDomains = domainParts
      .map((_, index, arr) => arr.slice(index).join("."))
      .filter((domain) => domain.includes(".")); // 确保至少包含一个点号
    console.log(possibleDomains);

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
}: {
  page?: number;
  pageSize?: number;
}) {
  const result = await db
    .select()
    .from(affServiceProviders)
    .orderBy(desc(affServiceProviders.id))
    .offset((page - 1) * pageSize)
    .limit(pageSize);

  return { data: result };
}

export async function getAffProviderCount() {
  const [result] = await db
    .select({ count: count() })
    .from(affServiceProviders);

  return { data: result?.count ?? 0 };
}

export async function updateAffProvider(data: AffManData) {
  const [result] = await db
    .update(affServiceProviders)
    .set(data)
    .where(eq(affServiceProviders.id, data.id))
    .returning();

  return { data: result };
}

export async function deleteAffProvider(id: number) {
  const [result] = await db
    .delete(affServiceProviders)
    .where(eq(affServiceProviders.id, id))
    .returning();

  return { data: result };
}

export async function deleteAffProviders(ids: number[]) {
  if (ids.length === 0) {
    return { data: 0 };
  }

  const result = await db
    .delete(affServiceProviders)
    .where(inArray(affServiceProviders.id, ids))
    .returning({ id: affServiceProviders.id });

  revalidatePath("/end/collect/aff-man");
  return { data: result.length };
}

export async function addAffProvider(data: Omit<AffManData, "id">) {
  const [result] = await db
    .insert(affServiceProviders)
    .values(data)
    .returning();

  revalidatePath("/end/collect/aff-man");
  return { data: result };
}
