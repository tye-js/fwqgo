"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  isHttpHref,
  isInternalHref,
  MAX_POSTGRES_INTEGER,
  parsePostgresIntegerId,
} from "@fwqgo/core/utils";
import {
  isPersistableServerOfferAmount,
  SERVER_OFFER_BILLING_CYCLES,
  SERVER_OFFER_CURRENCIES,
} from "@fwqgo/core/server-offer-price";
import { SERVER_OFFER_KINDS } from "@fwqgo/core/server-offer-kind";
import { defineAdminAction } from "@/features/cms/lib/define-admin-action";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import {
  bulkUpdateServerOffers,
  deleteServerOfferArticleRelation,
  offerReviewStatuses,
  offerStatuses,
  upsertServerOfferArticleRelation,
  updateServerOffer,
} from "@/server/offers/server-offers";

const publicOfferTopicSlugs = [
  "hong-kong",
  "united-states",
  "cheap-vps",
] as const;

function scheduleOfferCacheRefresh() {
  schedulePublicWebCache("offer.changed", {
    topicSlugs: [...publicOfferTopicSlugs],
  });
}

const nullableString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
  z.string().nullable(),
);

const nullablePrice = nullableString.refine(
  (value) => value === null || isPersistableServerOfferAmount(value),
  "价格必须是 0 到 9999999999.99 之间且最多保留两位小数",
);

const nullableCurrency = z.preprocess((value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().toUpperCase();
}, z.enum(SERVER_OFFER_CURRENCIES).nullable());

const nullableBillingCycle = z.preprocess((value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().toLowerCase();
}, z.enum(SERVER_OFFER_BILLING_CYCLES).nullable());

const nullablePurchaseUrl = nullableString.refine(
  (value) =>
    value === null ||
    isHttpHref(value) ||
    (isInternalHref(value) && /^\/go\/[a-z0-9-]+$/i.test(value)),
  "购买链接必须是 http/https URL 或 /go/ 短链",
);

const nullableInternalOrHttpUrl = nullableString.refine(
  (value) => value === null || isInternalHref(value) || isHttpHref(value),
  "链接必须是站内路径或 http/https URL",
);

const postgresIntegerId = z
  .number()
  .int()
  .positive()
  .max(MAX_POSTGRES_INTEGER, "ID 超出数据库范围");

const nullablePositiveInteger = z.preprocess((value) => {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "none"
  ) {
    return null;
  }
  const parsed =
    typeof value === "string" || typeof value === "number"
      ? parsePostgresIntegerId(value)
      : null;
  return parsed ?? value;
}, postgresIntegerId.nullable());

const nullableDate = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value !== "string" && typeof value !== "number") return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed;
}, z.date().nullable());

const offerPriceSchema = z.object({
  billingCycle: z.enum(SERVER_OFFER_BILLING_CYCLES),
  amount: z
    .string()
    .trim()
    .min(1, "请输入价格")
    .refine(isPersistableServerOfferAmount, {
      message: "价格必须是 0 到 9999999999.99 之间且最多保留两位小数",
    }),
  originalAmount: nullablePrice.optional(),
  currency: z.enum(SERVER_OFFER_CURRENCIES),
  purchaseUrl: nullablePurchaseUrl.optional(),
  active: z.boolean(),
  validUntil: nullableDate.optional(),
});
const offerPricesSchema = z
  .array(offerPriceSchema)
  .max(20, "每个套餐最多配置 20 个价格周期")
  .superRefine((prices, context) => {
    const seen = new Set<string>();
    prices.forEach((price, index) => {
      const key = `${price.billingCycle}:${price.currency}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: [index, "billingCycle"],
          message: "同一币种和付款周期只能配置一条价格",
        });
      }
      seen.add(key);
    });
  });

const lockedOfferFields = [
  "title",
  "offerKind",
  "specs",
  "location",
  "status",
  "price",
  "purchaseUrl",
  "promoCode",
] as const;

const updateOfferSchema = z.object({
  title: z.string().trim().min(1, "请输入套餐标题"),
  offerKind: z.enum(SERVER_OFFER_KINDS),
  providerId: nullablePositiveInteger,
  providerName: nullableString,
  externalProductId: nullableString,
  productGroup: nullableString,
  productType: nullableString,
  cpu: nullableString,
  memory: nullableString,
  storage: nullableString,
  bandwidth: nullableString,
  traffic: nullableString,
  priceAmount: nullablePrice,
  currency: nullableCurrency,
  billingCycle: nullableBillingCycle,
  region: nullableString,
  lineType: nullableString,
  status: z.enum(offerStatuses),
  purchaseUrl: nullablePurchaseUrl,
  promoCode: nullableString,
  articleUrl: nullableInternalOrHttpUrl,
  reviewUrl: nullableInternalOrHttpUrl,
  visible: z.coerce.boolean(),
  featured: z.coerce.boolean(),
  reviewStatus: z.enum(offerReviewStatuses),
  lockedFields: z
    .array(z.enum(lockedOfferFields))
    .max(lockedOfferFields.length),
  validUntil: nullableDate,
  prices: offerPricesSchema,
});

const bulkUpdateOfferSchema = z
  .object({
    ids: z.array(postgresIntegerId).min(1).max(500),
    offerKind: z.enum(SERVER_OFFER_KINDS).optional(),
    status: z.enum(offerStatuses).optional(),
    visible: z.boolean().optional(),
    featured: z.boolean().optional(),
    reviewStatus: z
      .enum(["pending", "reviewed", "needs_fix", "duplicate"])
      .optional(),
  })
  .refine(
    (value) =>
      value.offerKind !== undefined ||
      value.status !== undefined ||
      value.visible !== undefined ||
      value.featured !== undefined ||
      value.reviewStatus !== undefined,
    { message: "请选择至少一个要更新的字段" },
  );

const offerArticleRelationSchema = z.object({
  offerId: postgresIntegerId,
  postId: postgresIntegerId,
  relationType: z.enum(["review", "mention", "deal"]),
});

type BulkUpdateOfferActionInput = {
  ids: number[];
  offerKind?: string;
  status?: string;
  visible?: boolean;
  featured?: boolean;
  reviewStatus?: string;
};

function parseJsonField(value: FormDataEntryValue | null, label: string) {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(
      `${label}数据格式错误：${
        error instanceof Error ? error.message : "不是有效 JSON"
      }`,
    );
  }
}

function revalidateOfferPages() {
  revalidatePath("/servers");
  revalidatePath("/servers/manage");
  revalidatePath("/servers/hong-kong");
  revalidatePath("/servers/united-states");
  revalidatePath("/servers/cheap-vps");
}

function parseUpdateOfferActionInput(input: {
  id: number;
  formData: FormData;
}) {
  if (
    !Number.isSafeInteger(input.id) ||
    input.id <= 0 ||
    input.id > MAX_POSTGRES_INTEGER
  ) {
    throw new Error("套餐 ID 无效");
  }

  return {
    id: input.id,
    offer: updateOfferSchema.parse({
      title: input.formData.get("title"),
      offerKind: input.formData.get("offerKind"),
      providerId: input.formData.get("providerId"),
      providerName: input.formData.get("providerName"),
      externalProductId: input.formData.get("externalProductId"),
      productGroup: input.formData.get("productGroup"),
      productType: input.formData.get("productType"),
      cpu: input.formData.get("cpu"),
      memory: input.formData.get("memory"),
      storage: input.formData.get("storage"),
      bandwidth: input.formData.get("bandwidth"),
      traffic: input.formData.get("traffic"),
      priceAmount: input.formData.get("priceAmount"),
      currency: input.formData.get("currency"),
      billingCycle: input.formData.get("billingCycle"),
      region: input.formData.get("region"),
      lineType: input.formData.get("lineType"),
      status: input.formData.get("status"),
      purchaseUrl: input.formData.get("purchaseUrl"),
      promoCode: input.formData.get("promoCode"),
      articleUrl: input.formData.get("articleUrl"),
      reviewUrl: input.formData.get("reviewUrl"),
      visible: input.formData.get("visible") === "true",
      featured: input.formData.get("featured") === "true",
      reviewStatus: input.formData.get("reviewStatus"),
      lockedFields: parseJsonField(
        input.formData.get("lockedFieldsJson"),
        "锁定字段",
      ),
      validUntil: input.formData.get("validUntil"),
      prices: parseJsonField(input.formData.get("pricesJson"), "多周期价格"),
    }),
  };
}

const saveServerOfferArticleRelation = defineAdminAction({
  action: "server_offer.article_relation.save",
  entityType: "server_offer",
  parse: (input: z.input<typeof offerArticleRelationSchema>) =>
    offerArticleRelationSchema.parse(input),
  execute: async (input) => {
    const result = await upsertServerOfferArticleRelation(input);
    revalidatePath("/servers/manage");
    scheduleOfferCacheRefresh();
    return result;
  },
  successMessage: "套餐文章关系已保存",
  errorTitle: "保存套餐文章关系失败",
  errorSuggestion: "请确认套餐和文章仍然存在后重试。",
  entityId: (input) => input.offerId,
});

const deleteServerOfferArticleRelationMutation = defineAdminAction({
  action: "server_offer.article_relation.delete",
  entityType: "server_offer_article_relation",
  parse: (sourceId: number) => postgresIntegerId.parse(sourceId),
  execute: async (sourceId) => {
    const result = await deleteServerOfferArticleRelation(sourceId);
    revalidatePath("/servers/manage");
    scheduleOfferCacheRefresh();
    return result;
  },
  successMessage: "套餐文章关系已删除",
  errorTitle: "删除套餐文章关系失败",
  errorSuggestion: "请刷新套餐列表后重试。",
  entityId: (sourceId) => sourceId,
});

const updateServerOfferMutation = defineAdminAction({
  action: "server_offer.update",
  entityType: "server_offer",
  parse: parseUpdateOfferActionInput,
  execute: async ({ id, offer }) => {
    const updated = await updateServerOffer(id, offer);
    if (!updated) throw new Error("套餐不存在");
    revalidateOfferPages();
    scheduleOfferCacheRefresh();
    return updated;
  },
  successMessage: "套餐已更新",
  errorTitle: "保存套餐失败",
  errorSuggestion: "请检查套餐字段和价格配置后重试。",
  entityId: ({ id }) => id,
});

const bulkUpdateServerOffersMutation = defineAdminAction({
  action: "server_offer.bulk_update",
  entityType: "server_offer",
  parse: (
    input: BulkUpdateOfferActionInput,
  ): z.output<typeof bulkUpdateOfferSchema> => {
    const parsed = bulkUpdateOfferSchema.parse(input);
    return { ...parsed, ids: [...new Set(parsed.ids)] };
  },
  execute: async (input) => {
    const result = await bulkUpdateServerOffers(input);
    revalidateOfferPages();
    if (result.updated > 0) scheduleOfferCacheRefresh();
    return result;
  },
  successMessage: (result) => `已更新 ${result.updated} 条套餐`,
  errorTitle: "批量更新服务器套餐失败",
  errorSuggestion: "请刷新列表确认套餐状态后重试。",
  entityId: (input) => `batch:${input.ids.length}`,
});

export async function saveServerOfferArticleRelationAction(input: {
  offerId: number;
  postId: number;
  relationType: "review" | "mention" | "deal";
}) {
  return saveServerOfferArticleRelation(input);
}

export async function deleteServerOfferArticleRelationAction(sourceId: number) {
  return deleteServerOfferArticleRelationMutation(sourceId);
}

export async function updateServerOfferAction(id: number, formData: FormData) {
  return updateServerOfferMutation({ id, formData });
}

export async function bulkUpdateServerOffersAction(input: {
  ids: number[];
  offerKind?: string;
  status?: string;
  visible?: boolean;
  featured?: boolean;
  reviewStatus?: string;
}) {
  return bulkUpdateServerOffersMutation(input);
}
