"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { isHttpHref, isInternalHref } from "@fwqgo/core/utils";
import {
  adminActionFailure,
  adminActionSuccess,
} from "@/lib/admin-action-result";
import {
  deleteHomepageSlot,
  homepageSlotContentTypes,
  homepageSlotLanguages,
  homepageSlotPlacements,
  saveHomepageSlot,
} from "@/server/homepage/homepage-slots";
import { notifyPublicWebCache } from "@/server/cache/public-revalidation-client";

const nullableString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
  z.string().nullable(),
);

const nullableId = z.preprocess((value) => {
  if (value === null || value === undefined || value === "" || value === "none") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : value;
}, z.number().int().positive().nullable());

const nullableDate = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : value;
  if (!(parsed instanceof Date)) return value;
  return Number.isNaN(parsed.getTime()) ? value : parsed;
}, z.date().nullable());

const safeTargetUrl = nullableString.refine(
  (value) => value === null || isInternalHref(value) || isHttpHref(value),
  "目标链接必须是站内路径或 http/https URL",
);

const homepageSlotInputSchema = z
  .object({
    id: nullableId,
    language: z.enum(homepageSlotLanguages),
    placement: z.enum(homepageSlotPlacements),
    contentType: z.enum(homepageSlotContentTypes),
    postId: nullableId,
    offerId: nullableId,
    imageAssetId: nullableId,
    title: nullableString,
    description: nullableString,
    targetUrl: safeTargetUrl,
    altText: nullableString,
    sortOrder: z.number().int().min(-10_000).max(10_000),
    startsAt: nullableDate,
    endsAt: nullableDate,
    enabled: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.contentType === "post" && !value.postId) {
      context.addIssue({ code: "custom", path: ["postId"], message: "请选择文章" });
    }
    if (value.contentType === "offer" && !value.offerId) {
      context.addIssue({ code: "custom", path: ["offerId"], message: "请选择套餐" });
    }
    if (value.contentType === "image_link" && !value.imageAssetId) {
      context.addIssue({ code: "custom", path: ["imageAssetId"], message: "请选择图片" });
    }
    if (value.contentType === "image_link" && !value.targetUrl) {
      context.addIssue({ code: "custom", path: ["targetUrl"], message: "图片推广位需要目标链接" });
    }
    if (
      value.startsAt &&
      value.endsAt &&
      value.endsAt.getTime() <= value.startsAt.getTime()
    ) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "下线时间必须晚于上线时间",
      });
    }
  });

export type HomepageSlotActionInput = z.input<typeof homepageSlotInputSchema>;

export async function saveHomepageSlotAction(rawInput: HomepageSlotActionInput) {
  try {
    await requireAdminSession();
    const input = homepageSlotInputSchema.parse(rawInput);
    const result = await saveHomepageSlot(input.id, {
      language: input.language,
      placement: input.placement,
      contentType: input.contentType,
      postId: input.postId,
      offerId: input.offerId,
      imageAssetId: input.imageAssetId,
      title: input.title,
      description: input.description,
      targetUrl: input.targetUrl,
      altText: input.altText,
      sortOrder: input.sortOrder,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      enabled: input.enabled,
    });
    revalidatePath("/collect/homepage-promoted");
    await notifyPublicWebCache("homepage.changed");
    return adminActionSuccess(
      result,
      input.id ? "首页推广位已更新" : "首页推广位已创建",
    );
  } catch (error) {
    return adminActionFailure(error, {
      title: "保存首页推广位失败",
      suggestion: "请检查内容类型、目标内容、链接和定时上下线时间。",
    });
  }
}

export async function deleteHomepageSlotAction(id: number) {
  try {
    await requireAdminSession();
    if (!Number.isInteger(id) || id <= 0) throw new Error("推广位 ID 无效");
    const result = await deleteHomepageSlot(id);
    revalidatePath("/collect/homepage-promoted");
    await notifyPublicWebCache("homepage.changed");
    return adminActionSuccess(result, "首页推广位已删除");
  } catch (error) {
    return adminActionFailure(error, {
      title: "删除首页推广位失败",
      suggestion: "请刷新页面确认推广位仍然存在，然后重试。",
    });
  }
}
