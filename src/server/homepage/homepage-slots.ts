import "server-only";

import { and, asc, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { cacheLife } from "next/cache";

import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { db, readDb } from "@fwqgo/db";
import {
  homepageSlots,
  imageAssets,
  posts,
  serverOffers,
} from "@fwqgo/db/schema";

export const homepageSlotLanguages = ["zh", "en"] as const;
export const homepageSlotPlacements = [
  "hero_primary",
  "promo_grid",
  "featured_offers",
  "sidebar",
] as const;
export const homepageSlotContentTypes = [
  "post",
  "offer",
  "image_link",
] as const;

export type HomepageSlotLanguage = (typeof homepageSlotLanguages)[number];
export type HomepageSlotPlacement = (typeof homepageSlotPlacements)[number];
export type HomepageSlotContentType = (typeof homepageSlotContentTypes)[number];

export function getHomepageSlotReferenceTime() {
  return Date.now();
}

const activeHomepageSlotSelection = {
  id: homepageSlots.id,
  language: homepageSlots.language,
  placement: homepageSlots.placement,
  contentType: homepageSlots.contentType,
  title: homepageSlots.title,
  description: homepageSlots.description,
  targetUrl: homepageSlots.targetUrl,
  altText: homepageSlots.altText,
  sortOrder: homepageSlots.sortOrder,
  startsAt: homepageSlots.startsAt,
  endsAt: homepageSlots.endsAt,
  trackingKey: homepageSlots.trackingKey,
  postId: homepageSlots.postId,
  postTitle: posts.title,
  postSlug: posts.slug,
  postDescription: posts.description,
  postImageUrl: posts.imgUrl,
  postPublished: posts.published,
  postLanguage: posts.language,
  offerId: homepageSlots.offerId,
  offerTitle: serverOffers.title,
  offerProviderName: serverOffers.providerName,
  offerRegion: serverOffers.region,
  offerLineType: serverOffers.lineType,
  offerPriceAmount: serverOffers.priceAmount,
  offerCurrency: serverOffers.currency,
  offerBillingCycle: serverOffers.billingCycle,
  offerPromoCode: serverOffers.promoCode,
  offerPurchaseUrl: serverOffers.purchaseUrl,
  offerArticleUrl: serverOffers.articleUrl,
  offerStatus: serverOffers.status,
  imageAssetId: homepageSlots.imageAssetId,
  imagePath: imageAssets.path,
  imageThumbPath: imageAssets.thumbPath,
  imageLargePath: imageAssets.largePath,
  imageAltZh: imageAssets.altZh,
  imageAltEn: imageAssets.altEn,
};

export async function getActiveHomepageSlots(
  language: HomepageSlotLanguage = "zh",
) {
  "use cache";
  cacheLife("minutes");
  tagCache(
    cacheTags.homepage,
    cacheTags.homepageSlots,
    cacheTags.posts,
    cacheTags.serverOffers,
  );

  const now = new Date();
  try {
    const rows = await readDb
      .select(activeHomepageSlotSelection)
      .from(homepageSlots)
      .leftJoin(posts, eq(homepageSlots.postId, posts.id))
      .leftJoin(serverOffers, eq(homepageSlots.offerId, serverOffers.id))
      .leftJoin(imageAssets, eq(homepageSlots.imageAssetId, imageAssets.id))
      .where(
        and(
          eq(homepageSlots.language, language),
          eq(homepageSlots.enabled, true),
          or(isNull(homepageSlots.startsAt), lte(homepageSlots.startsAt, now)),
          or(isNull(homepageSlots.endsAt), gt(homepageSlots.endsAt, now)),
          or(
            and(
              eq(homepageSlots.contentType, "offer"),
              eq(serverOffers.visible, true),
            ),
            and(
              eq(homepageSlots.contentType, "image_link"),
              eq(imageAssets.status, "active"),
            ),
            and(
              eq(homepageSlots.contentType, "post"),
              eq(posts.published, true),
              eq(posts.language, language),
            ),
          ),
        ),
      )
      .orderBy(
        asc(homepageSlots.placement),
        asc(homepageSlots.sortOrder),
        desc(homepageSlots.createdAt),
      );

    return rows.map((row) => {
      const postHref = row.postSlug
        ? language === "en"
          ? `/en/fwq/posts/${encodeURIComponent(row.postSlug)}`
          : `/fwq/posts/${encodeURIComponent(row.postSlug)}`
        : null;
      const fallbackImage =
        row.imageLargePath ?? row.imagePath ?? row.postImageUrl ?? null;
      const defaultTarget =
        row.contentType === "post"
          ? postHref
          : row.contentType === "offer"
            ? (row.offerPurchaseUrl ?? row.offerArticleUrl)
            : null;
      const offerDescription = [
        row.offerProviderName,
        row.offerRegion,
        row.offerLineType,
      ]
        .filter(Boolean)
        .join(" · ");

      return {
        ...row,
        resolvedTitle:
          row.title ?? row.postTitle ?? row.offerTitle ?? "推广内容",
        resolvedDescription:
          row.description ??
          row.postDescription ??
          (offerDescription ? offerDescription : null),
        resolvedImageUrl: fallbackImage,
        resolvedTargetUrl: row.targetUrl ?? defaultTarget,
        resolvedAltText:
          row.altText ??
          (language === "en" ? row.imageAltEn : row.imageAltZh) ??
          row.title ??
          row.postTitle ??
          row.offerTitle ??
          "",
      };
    });
  } catch (error) {
    console.error("Failed to load homepage slots:", error);
    return [];
  }
}

export async function getAdminHomepageSlots(language: HomepageSlotLanguage) {
  await requireAdminSession();
  return readDb
    .select({
      ...activeHomepageSlotSelection,
      enabled: homepageSlots.enabled,
      createdAt: homepageSlots.createdAt,
      updatedAt: homepageSlots.updatedAt,
    })
    .from(homepageSlots)
    .leftJoin(posts, eq(homepageSlots.postId, posts.id))
    .leftJoin(serverOffers, eq(homepageSlots.offerId, serverOffers.id))
    .leftJoin(imageAssets, eq(homepageSlots.imageAssetId, imageAssets.id))
    .where(eq(homepageSlots.language, language))
    .orderBy(
      asc(homepageSlots.placement),
      asc(homepageSlots.sortOrder),
      desc(homepageSlots.createdAt),
    );
}

export async function getHomepageSlotOptions(language: HomepageSlotLanguage) {
  await requireAdminSession();
  const [postOptions, offerOptions, imageOptions] = await Promise.all([
    readDb
      .select({ id: posts.id, title: posts.title, slug: posts.slug })
      .from(posts)
      .where(and(eq(posts.language, language), eq(posts.published, true)))
      .orderBy(desc(posts.createdAt))
      .limit(200),
    readDb
      .select({
        id: serverOffers.id,
        title: serverOffers.title,
        providerName: serverOffers.providerName,
      })
      .from(serverOffers)
      .where(eq(serverOffers.visible, true))
      .orderBy(desc(serverOffers.updatedAt), desc(serverOffers.createdAt))
      .limit(200),
    readDb
      .select({
        id: imageAssets.id,
        path: imageAssets.path,
        originalName: imageAssets.originalName,
      })
      .from(imageAssets)
      .where(eq(imageAssets.status, "active"))
      .orderBy(desc(imageAssets.createdAt))
      .limit(200),
  ]);
  return { postOptions, offerOptions, imageOptions };
}

export type HomepageSlotMutationInput = {
  language: HomepageSlotLanguage;
  placement: HomepageSlotPlacement;
  contentType: HomepageSlotContentType;
  postId?: number | null;
  offerId?: number | null;
  imageAssetId?: number | null;
  title?: string | null;
  description?: string | null;
  targetUrl?: string | null;
  altText?: string | null;
  sortOrder: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  enabled: boolean;
};

export async function saveHomepageSlot(
  id: number | null,
  input: HomepageSlotMutationInput,
) {
  if (input.contentType === "post") {
    if (!input.postId) throw new Error("请选择推广文章");
    const [post] = await readDb
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.id, input.postId),
          eq(posts.language, input.language),
          eq(posts.published, true),
        ),
      )
      .limit(1);
    if (!post) throw new Error("所选文章不存在、未发布或语言不匹配");
  }
  if (input.contentType === "offer") {
    if (!input.offerId) throw new Error("请选择推广套餐");
    const [offer] = await readDb
      .select({ id: serverOffers.id })
      .from(serverOffers)
      .where(
        and(eq(serverOffers.id, input.offerId), eq(serverOffers.visible, true)),
      )
      .limit(1);
    if (!offer) throw new Error("所选套餐不存在或已经隐藏");
  }
  if (input.imageAssetId) {
    const [image] = await readDb
      .select({ id: imageAssets.id })
      .from(imageAssets)
      .where(
        and(
          eq(imageAssets.id, input.imageAssetId),
          eq(imageAssets.status, "active"),
        ),
      )
      .limit(1);
    if (!image) throw new Error("所选图片不存在或已经停用");
  }
  if (input.contentType === "image_link" && !input.imageAssetId) {
    throw new Error("图片推广位必须选择图片资产");
  }

  const now = new Date();
  const values = {
    ...input,
    postId: input.contentType === "post" ? (input.postId ?? null) : null,
    offerId: input.contentType === "offer" ? (input.offerId ?? null) : null,
    imageAssetId: input.imageAssetId ?? null,
    updatedAt: now,
  };

  if (id) {
    const [updated] = await db
      .update(homepageSlots)
      .set(values)
      .where(eq(homepageSlots.id, id))
      .returning({ id: homepageSlots.id });
    if (!updated) throw new Error("首页推广位不存在");
    return updated;
  }

  const [created] = await db
    .insert(homepageSlots)
    .values({ ...values, createdAt: now })
    .returning({ id: homepageSlots.id });
  if (!created) throw new Error("首页推广位创建失败");
  return created;
}

export async function deleteHomepageSlot(id: number) {
  const [deleted] = await db
    .delete(homepageSlots)
    .where(eq(homepageSlots.id, id))
    .returning({ id: homepageSlots.id });
  if (!deleted) throw new Error("首页推广位不存在");
  return deleted;
}
