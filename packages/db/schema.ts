import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  primaryKey,
  index,
  uniqueIndex,
  unique,
  foreignKey,
  bigint,
  bigserial,
  numeric,
  jsonb,
  check,
} from "drizzle-orm/pg-core";

// Post table
export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    slug: varchar("slug", { length: 320 }).notNull().unique(),
    content: text("content").notNull(),
    keywords: varchar("keywords", { length: 800 }),
    description: varchar("description", { length: 800 }),
    imgUrl: text("imgUrl"),
    language: varchar("language", { length: 8 }).default("zh").notNull(),
    affiliateReviewStatus: varchar("affiliateReviewStatus", { length: 24 })
      .default("pending")
      .notNull(),
    affiliateReviewDetails: text("affiliateReviewDetails"),
    affiliateReviewUpdatedAt: timestamp("affiliateReviewUpdatedAt"),
    published: boolean("published").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
    views: integer("views").default(0).notNull(),
    recommendedTagName: text("recommendedTagName"),
    recommendedTagId: integer("recommendedTagId"),
    translationSourcePostId: integer("translationSourcePostId"),
    authorId: text("authorId"),
    categoryId: integer("categoryId").notNull(),
  },
  (table) => ({
    titleIdx: index("posts_title_idx").on(table.title),
    categoryIdx: index("posts_categoryId_idx").on(table.categoryId),
    authorIdx: index("posts_authorId_idx").on(table.authorId),
    languageIdx: index("posts_language_idx").on(table.language),
    languagePublishedCreatedAtIdx: index(
      "posts_language_published_createdAt_idx",
    ).on(table.language, table.published, table.createdAt),
    recommendedTagIdx: index("posts_recommendedTagName_idx").on(
      table.recommendedTagName,
    ),
    recommendedTagIdIdx: index("posts_recommendedTagId_idx").on(
      table.recommendedTagId,
    ),
    translationSourcePostIdIdx: index("posts_translationSourcePostId_idx").on(
      table.translationSourcePostId,
    ),
    affiliateReviewStatusIdx: index("posts_affiliateReviewStatus_idx").on(
      table.affiliateReviewStatus,
    ),
    publishedCreatedAtIdx: index("posts_published_createdAt_idx").on(
      table.published,
      table.createdAt,
    ),
    publishedUpdatedAtIdx: index("posts_published_updatedAt_idx").on(
      table.published,
      table.updatedAt,
    ),
    publishedViewsCreatedAtIdx: index("posts_published_views_createdAt_idx").on(
      table.published,
      table.views,
      table.createdAt,
    ),
    categoryPublishedCreatedAtIdx: index(
      "posts_categoryId_published_createdAt_idx",
    ).on(table.categoryId, table.published, table.createdAt),
    categoryLanguagePublishedCreatedAtIdx: index(
      "posts_categoryId_language_published_createdAt_idx",
    ).on(table.categoryId, table.language, table.published, table.createdAt),
    translationSourceLanguagePublishedUpdatedAtIdx: index(
      "posts_translationSource_language_published_updatedAt_idx",
    ).on(
      table.translationSourcePostId,
      table.language,
      table.published,
      table.updatedAt,
    ),
    publishedIdIdx: index("posts_published_id_idx").on(
      table.published,
      table.id,
    ),
    translationSourceLanguageUnique: uniqueIndex(
      "posts_translationSource_language_unique",
    )
      .on(table.translationSourcePostId, table.language)
      .where(sql`${table.translationSourcePostId} is not null`),
    languageCheck: check(
      "posts_language_check",
      sql`${table.language} in ('zh', 'en')`,
    ),
    translationDirectionCheck: check(
      "posts_translation_direction_check",
      sql`${table.language} <> 'zh' or ${table.translationSourcePostId} is null`,
    ),
    affiliateReviewStatusCheck: check(
      "posts_affiliateReviewStatus_check",
      sql`${table.affiliateReviewStatus} in ('pending', 'manual_required', 'passed')`,
    ),
    categoryFk: foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categories.id],
      name: "posts_categoryId_categories_id_fk",
    }).onDelete("restrict"),
    authorFk: foreignKey({
      columns: [table.authorId],
      foreignColumns: [users.id],
      name: "posts_authorId_users_id_fk",
    }).onDelete("set null"),
    recommendedTagFk: foreignKey({
      columns: [table.recommendedTagId],
      foreignColumns: [tags.id],
      name: "posts_recommendedTagId_tags_id_fk",
    }).onDelete("set null"),
    translationSourcePostFk: foreignKey({
      columns: [table.translationSourcePostId],
      foreignColumns: [table.id],
      name: "posts_translationSourcePostId_posts_id_fk",
    }).onDelete("set null"),
  }),
);

// Category table
export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    enName: text("enName"),
    enSlug: text("enSlug"),
    description: varchar("description", { length: 800 }),
    keywords: varchar("keywords", { length: 800 }),
    enDescription: varchar("enDescription", { length: 800 }),
    enKeywords: varchar("enKeywords", { length: 800 }),
    parentId: integer("parentId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    parentIdx: index("categories_parentId_idx").on(table.parentId),
    enSlugUnique: unique("categories_enSlug_unique").on(table.enSlug),
    parentFk: foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "categories_parentId_categories_id_fk",
    }).onDelete("set null"),
  }),
);

// Tag table
export const tags = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    enName: text("enName"),
    keywords: varchar("keywords", { length: 800 }),
    description: varchar("description", { length: 800 }),
    enKeywords: varchar("enKeywords", { length: 800 }),
    enDescription: varchar("enDescription", { length: 800 }),
    slug: text("slug").notNull().unique(),
    enSlug: text("enSlug"),
    indexable: boolean("indexable").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    indexableIdx: index("tags_indexable_idx").on(table.indexable),
    enSlugUnique: unique("tags_enSlug_unique").on(table.enSlug),
  }),
);

// PostTag junction table
export const postTags = pgTable(
  "post_tags",
  {
    postId: integer("postId").notNull(),
    tagId: integer("tagId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.postId, table.tagId] }),
    tagIdx: index("post_tags_tagId_idx").on(table.tagId),
    postFk: foreignKey({
      columns: [table.postId],
      foreignColumns: [posts.id],
      name: "post_tags_postId_posts_id_fk",
    }).onDelete("cascade"),
    tagFk: foreignKey({
      columns: [table.tagId],
      foreignColumns: [tags.id],
      name: "post_tags_tagId_tags_id_fk",
    }).onDelete("restrict"),
  }),
);

// User table
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified"),
  image: text("image"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: text("actorId"),
    action: varchar("action", { length: 160 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: varchar("entityId", { length: 160 }),
    status: varchar("status", { length: 16 }).notNull(),
    requestId: varchar("requestId", { length: 120 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    error: text("error"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    actorCreatedAtIdx: index("admin_audit_logs_actorId_createdAt_idx").on(
      table.actorId,
      table.createdAt,
    ),
    actionCreatedAtIdx: index("admin_audit_logs_action_createdAt_idx").on(
      table.action,
      table.createdAt,
    ),
    entityIdx: index("admin_audit_logs_entity_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
    statusCheck: check(
      "admin_audit_logs_status_check",
      sql`${table.status} in ('success', 'failure')`,
    ),
    actorFk: foreignKey({
      columns: [table.actorId],
      foreignColumns: [users.id],
      name: "admin_audit_logs_actorId_users_id_fk",
    }).onDelete("set null"),
  }),
);

// Session table
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    sessionToken: text("sessionToken").notNull().unique(),
    userId: text("userId").notNull(),
    expires: timestamp("expires").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    expiresIdx: index("sessions_expires_idx").on(table.expires),
    userIdx: index("sessions_userId_idx").on(table.userId),
    userFk: foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "sessions_userId_users_id_fk",
    }).onDelete("cascade"),
  }),
);

// AffServiceProvider table
export const affServiceProviders = pgTable(
  "aff_service_providers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    slug: varchar("slug", { length: 160 }).unique(),
    aliases: text("aliases"),
    defaultPromoCode: text("defaultPromoCode"),
    affUrl: text("affUrl").notNull(),
    affParam: text("affParam").notNull(),
    affValue: text("affValue").notNull(),
    officialUrl: text("officialUrl").notNull(),
    summary: text("summary"),
    summarySourceUrl: text("summarySourceUrl"),
    refundPolicy: text("refundPolicy"),
    refundPolicySourceUrl: text("refundPolicySourceUrl"),
    prohibitedUses: text("prohibitedUses"),
    prohibitedUsesSourceUrl: text("prohibitedUsesSourceUrl"),
    profileVerifiedAt: timestamp("profileVerifiedAt"),
    profileUpdatedAt: timestamp("profileUpdatedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    officialUrlIdx: index("aff_service_providers_officialUrl_idx").on(
      table.officialUrl,
    ),
  }),
);

export const providerPromoCodes = pgTable(
  "provider_promo_codes",
  {
    id: serial("id").primaryKey(),
    providerId: integer("providerId").notNull(),
    code: varchar("code", { length: 160 }).notNull(),
    description: text("description"),
    discountText: varchar("discountText", { length: 500 }),
    terms: text("terms"),
    startsAt: timestamp("startsAt"),
    endsAt: timestamp("endsAt"),
    active: boolean("active").default(true).notNull(),
    isDefault: boolean("isDefault").default(false).notNull(),
    sourceUrl: text("sourceUrl"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    providerCodeUnique: uniqueIndex(
      "provider_promo_codes_providerId_code_unique",
    ).on(table.providerId, sql`lower(${table.code})`),
    providerDefaultUnique: uniqueIndex(
      "provider_promo_codes_providerId_default_unique",
    )
      .on(table.providerId)
      .where(sql`${table.isDefault} = true`),
    providerActiveEndsAtIdx: index(
      "provider_promo_codes_providerId_active_endsAt_idx",
    ).on(table.providerId, table.active, table.endsAt),
    providerFk: foreignKey({
      columns: [table.providerId],
      foreignColumns: [affServiceProviders.id],
      name: "provider_promo_codes_providerId_aff_service_providers_id_fk",
    }).onDelete("cascade"),
    dateRangeCheck: check(
      "provider_promo_codes_date_range_check",
      sql`${table.startsAt} is null or ${table.endsAt} is null or ${table.endsAt} >= ${table.startsAt}`,
    ),
    defaultActiveCheck: check(
      "provider_promo_codes_default_active_check",
      sql`${table.isDefault} = false or ${table.active} = true`,
    ),
  }),
);

export const providerProfileSnapshots = pgTable(
  "provider_profile_snapshots",
  {
    id: serial("id").primaryKey(),
    providerId: integer("providerId").notNull(),
    status: varchar("status", { length: 24 }).default("queued").notNull(),
    summary: text("summary"),
    summarySourceUrl: text("summarySourceUrl"),
    refundPolicy: text("refundPolicy"),
    refundPolicySourceUrl: text("refundPolicySourceUrl"),
    prohibitedUses: text("prohibitedUses"),
    prohibitedUsesSourceUrl: text("prohibitedUsesSourceUrl"),
    discoveredUrls: jsonb("discoveredUrls")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    error: text("error"),
    requestedBy: text("requestedBy"),
    reviewedBy: text("reviewedBy"),
    fetchedAt: timestamp("fetchedAt"),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    providerStatusCreatedAtIdx: index(
      "provider_profile_snapshots_providerId_status_createdAt_idx",
    ).on(table.providerId, table.status, table.createdAt),
    providerOpenUnique: uniqueIndex(
      "provider_profile_snapshots_providerId_open_unique",
    )
      .on(table.providerId)
      .where(sql`${table.status} in ('queued', 'running', 'pending')`),
    statusCreatedAtIdx: index(
      "provider_profile_snapshots_status_createdAt_idx",
    ).on(table.status, table.createdAt),
    providerFk: foreignKey({
      columns: [table.providerId],
      foreignColumns: [affServiceProviders.id],
      name: "provider_profile_snapshots_providerId_aff_service_providers_id_fk",
    }).onDelete("cascade"),
    requestedByFk: foreignKey({
      columns: [table.requestedBy],
      foreignColumns: [users.id],
      name: "provider_profile_snapshots_requestedBy_users_id_fk",
    }).onDelete("set null"),
    reviewedByFk: foreignKey({
      columns: [table.reviewedBy],
      foreignColumns: [users.id],
      name: "provider_profile_snapshots_reviewedBy_users_id_fk",
    }).onDelete("set null"),
    statusCheck: check(
      "provider_profile_snapshots_status_check",
      sql`${table.status} in ('queued', 'running', 'pending', 'applied', 'rejected', 'failed')`,
    ),
  }),
);

export const siteSeoConfigs = pgTable("site_seo_configs", {
  id: serial("id").primaryKey(),
  language: varchar("language", { length: 8 }).notNull().unique(),
  siteName: text("siteName").notNull(),
  title: text("title").notNull(),
  description: varchar("description", { length: 800 }),
  keywords: varchar("keywords", { length: 800 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt"),
});

export const imageAssets = pgTable(
  "image_assets",
  {
    id: serial("id").primaryKey(),
    path: text("path").notNull().unique(),
    thumbPath: text("thumbPath"),
    largePath: text("largePath"),
    originalName: text("originalName").notNull(),
    mime: varchar("mime", { length: 120 }).notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    hash: varchar("hash", { length: 128 }),
    imageType: varchar("imageType", { length: 40 }).default("upload").notNull(),
    status: varchar("status", { length: 24 }).default("active").notNull(),
    altZh: text("altZh"),
    altEn: text("altEn"),
    sourceUrl: text("sourceUrl"),
    prompt: text("prompt"),
    uploadedBy: text("uploadedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    hashIdx: index("image_assets_hash_idx").on(table.hash),
    uploadedByIdx: index("image_assets_uploadedBy_idx").on(table.uploadedBy),
    createdAtIdx: index("image_assets_createdAt_idx").on(table.createdAt),
    statusCreatedAtIdx: index("image_assets_status_createdAt_idx").on(
      table.status,
      table.createdAt,
    ),
    imageTypeCreatedAtIdx: index("image_assets_imageType_createdAt_idx").on(
      table.imageType,
      table.createdAt,
    ),
    imageTypeCheck: check(
      "image_assets_imageType_check",
      sql`${table.imageType} in ('upload', 'ai_cover', 'ai_generated', 'provider', 'post_cover')`,
    ),
    statusCheck: check(
      "image_assets_status_check",
      sql`${table.status} in ('active', 'archived', 'missing')`,
    ),
    uploadedByFk: foreignKey({
      columns: [table.uploadedBy],
      foreignColumns: [users.id],
      name: "image_assets_uploadedBy_users_id_fk",
    }).onDelete("set null"),
  }),
);

export const imageAssetReferences = pgTable(
  "image_asset_references",
  {
    id: serial("id").primaryKey(),
    imageId: integer("imageId").notNull(),
    sourceType: varchar("sourceType", { length: 40 }).notNull(),
    sourceId: text("sourceId").notNull(),
    sourceLabel: text("sourceLabel"),
    field: varchar("field", { length: 80 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    imageIdx: index("image_asset_references_imageId_idx").on(table.imageId),
    sourceIdx: index("image_asset_references_source_idx").on(
      table.sourceType,
      table.sourceId,
    ),
    uniqueReference: unique("image_asset_references_unique_ref").on(
      table.imageId,
      table.sourceType,
      table.sourceId,
      table.field,
    ),
    imageFk: foreignKey({
      columns: [table.imageId],
      foreignColumns: [imageAssets.id],
      name: "image_asset_references_imageId_image_assets_id_fk",
    }).onDelete("cascade"),
  }),
);

export const aiRewriteConfigs = pgTable(
  "ai_rewrite_configs",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    provider: varchar("provider", { length: 40 }).notNull(),
    baseUrl: text("baseUrl").notNull(),
    apiKey: text("apiKey"),
    model: text("model").notNull(),
    basePrompt: text("basePrompt"),
    metadataPrompt: text("metadataPrompt"),
    styleName: text("styleName").notNull(),
    stylePrompt: text("stylePrompt").notNull(),
    metadataStylePrompt: text("metadataStylePrompt"),
    englishStylePrompt: text("englishStylePrompt"),
    englishMetadataStylePrompt: text("englishMetadataStylePrompt"),
    temperature: integer("temperature").default(40).notNull(),
    maxTokens: integer("maxTokens").default(8192).notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    isDefault: boolean("isDefault").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    providerIdx: index("ai_rewrite_configs_provider_idx").on(table.provider),
    enabledIdx: index("ai_rewrite_configs_enabled_idx").on(table.enabled),
    singleDefault: uniqueIndex("ai_rewrite_configs_single_default_unique")
      .on(table.isDefault)
      .where(sql`${table.isDefault} = true`),
    defaultRequiresEnabled: check(
      "ai_rewrite_configs_default_requires_enabled",
      sql`NOT ${table.isDefault} OR ${table.enabled}`,
    ),
  }),
);

export const sourceMaterials = pgTable(
  "source_materials",
  {
    id: serial("id").primaryKey(),
    materialType: varchar("materialType", { length: 24 })
      .default("url")
      .notNull(),
    sourceUrl: text("sourceUrl"),
    title: text("title"),
    content: text("content"),
    fileName: text("fileName"),
    mime: varchar("mime", { length: 120 }),
    size: bigint("size", { mode: "number" }),
    categoryId: integer("categoryId").notNull(),
    rewriteStyleId: integer("rewriteStyleId"),
    status: varchar("status", { length: 24 }).default("queued").notNull(),
    metadata: text("metadata"),
    createdBy: text("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    materialTypeIdx: index("source_materials_materialType_idx").on(
      table.materialType,
    ),
    sourceUrlIdx: index("source_materials_sourceUrl_idx").on(table.sourceUrl),
    statusIdx: index("source_materials_status_idx").on(table.status),
    createdAtIdx: index("source_materials_createdAt_idx").on(table.createdAt),
    statusCreatedAtIdx: index("source_materials_status_createdAt_idx").on(
      table.status,
      table.createdAt,
    ),
    materialTypeCheck: check(
      "source_materials_materialType_check",
      sql`${table.materialType} in ('url', 'text', 'email', 'file')`,
    ),
    statusCheck: check(
      "source_materials_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'manual_required', 'cancelled', 'deleted')`,
    ),
    categoryFk: foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categories.id],
      name: "source_materials_categoryId_categories_id_fk",
    }).onDelete("restrict"),
    rewriteStyleFk: foreignKey({
      columns: [table.rewriteStyleId],
      foreignColumns: [aiRewriteConfigs.id],
      name: "source_materials_rewriteStyleId_ai_rewrite_configs_id_fk",
    }).onDelete("set null"),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: "source_materials_createdBy_users_id_fk",
    }).onDelete("set null"),
  }),
);

export const aiRewriteTasks = pgTable(
  "ai_rewrite_tasks",
  {
    id: serial("id").primaryKey(),
    sourceMaterialId: integer("sourceMaterialId"),
    sourceUrl: text("sourceUrl").notNull(),
    sourceType: varchar("sourceType", { length: 24 }).default("url").notNull(),
    sourceTitle: text("sourceTitle"),
    sourceContent: text("sourceContent"),
    sourceFileName: text("sourceFileName"),
    status: varchar("status", { length: 24 }).default("pending").notNull(),
    progress: integer("progress").default(0).notNull(),
    currentStep: text("currentStep"),
    error: text("error"),
    categoryId: integer("categoryId").notNull(),
    rewriteStyleId: integer("rewriteStyleId"),
    rewriteConfigName: text("rewriteConfigName"),
    rewriteProvider: varchar("rewriteProvider", { length: 40 }),
    rewriteModel: text("rewriteModel"),
    imageConfigId: integer("imageConfigId"),
    imageConfigName: text("imageConfigName"),
    imageProvider: varchar("imageProvider", { length: 40 }),
    imageModel: text("imageModel"),
    postId: integer("postId"),
    resultTitle: text("resultTitle"),
    scrapedTitle: text("scrapedTitle"),
    scrapedDescription: text("scrapedDescription"),
    scrapedHtml: text("scrapedHtml"),
    aiInputLength: integer("aiInputLength"),
    rewriteOutputLength: integer("rewriteOutputLength"),
    diagnostics: text("diagnostics"),
    attempts: integer("attempts").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
    startedAt: timestamp("startedAt"),
    finishedAt: timestamp("finishedAt"),
    leaseOwner: varchar("leaseOwner", { length: 128 }),
    leaseExpiresAt: timestamp("leaseExpiresAt"),
    heartbeatAt: timestamp("heartbeatAt"),
  },
  (table) => ({
    sourceMaterialIdx: index("ai_rewrite_tasks_sourceMaterialId_idx").on(
      table.sourceMaterialId,
    ),
    statusIdx: index("ai_rewrite_tasks_status_idx").on(table.status),
    createdAtIdx: index("ai_rewrite_tasks_createdAt_idx").on(table.createdAt),
    postIdx: index("ai_rewrite_tasks_postId_idx").on(table.postId),
    imageConfigIdx: index("ai_rewrite_tasks_imageConfigId_idx").on(
      table.imageConfigId,
    ),
    statusCreatedAtIdx: index("ai_rewrite_tasks_status_createdAt_idx").on(
      table.status,
      table.createdAt,
    ),
    statusLeaseExpiresAtIdx: index(
      "ai_rewrite_tasks_status_leaseExpiresAt_idx",
    ).on(table.status, table.leaseExpiresAt),
    sourceUrlCreatedAtIdx: index("ai_rewrite_tasks_sourceUrl_createdAt_idx").on(
      table.sourceUrl,
      table.createdAt,
    ),
    statusCheck: check(
      "ai_rewrite_tasks_status_check",
      sql`${table.status} in ('pending', 'running', 'succeeded', 'failed', 'manual_required', 'cancelled')`,
    ),
    sourceTypeCheck: check(
      "ai_rewrite_tasks_sourceType_check",
      sql`${table.sourceType} in ('url', 'text', 'email', 'file', 'english', 'seo')`,
    ),
    progressCheck: check(
      "ai_rewrite_tasks_progress_check",
      sql`${table.progress} between 0 and 100`,
    ),
    attemptsCheck: check(
      "ai_rewrite_tasks_attempts_check",
      sql`${table.attempts} >= 0`,
    ),
    sourceMaterialFk: foreignKey({
      columns: [table.sourceMaterialId],
      foreignColumns: [sourceMaterials.id],
      name: "ai_rewrite_tasks_sourceMaterialId_source_materials_id_fk",
    }).onDelete("set null"),
    categoryFk: foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categories.id],
      name: "ai_rewrite_tasks_categoryId_categories_id_fk",
    }).onDelete("restrict"),
    rewriteStyleFk: foreignKey({
      columns: [table.rewriteStyleId],
      foreignColumns: [aiRewriteConfigs.id],
      name: "ai_rewrite_tasks_rewriteStyleId_ai_rewrite_configs_id_fk",
    }).onDelete("set null"),
    postFk: foreignKey({
      columns: [table.postId],
      foreignColumns: [posts.id],
      name: "ai_rewrite_tasks_postId_posts_id_fk",
    }).onDelete("set null"),
  }),
);

export const aiTaskSteps = pgTable(
  "ai_task_steps",
  {
    id: serial("id").primaryKey(),
    taskId: integer("taskId").notNull(),
    stepKey: varchar("stepKey", { length: 64 }).notNull(),
    stepName: text("stepName").notNull(),
    attempt: integer("attempt").default(1).notNull(),
    status: varchar("status", { length: 24 }).default("pending").notNull(),
    progress: integer("progress").default(0).notNull(),
    message: text("message"),
    error: text("error"),
    payload: text("payload"),
    startedAt: timestamp("startedAt"),
    finishedAt: timestamp("finishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    taskIdx: index("ai_task_steps_taskId_idx").on(table.taskId),
    statusIdx: index("ai_task_steps_status_idx").on(table.status),
    taskAttemptIdIdx: index("ai_task_steps_taskId_attempt_id_idx").on(
      table.taskId,
      table.attempt,
      table.id,
    ),
    stepAttemptUnique: unique("ai_task_steps_task_step_attempt_unique").on(
      table.taskId,
      table.stepKey,
      table.attempt,
    ),
    statusCheck: check(
      "ai_task_steps_status_check",
      sql`${table.status} in ('pending', 'running', 'success', 'failed', 'skipped', 'manual_required')`,
    ),
    progressCheck: check(
      "ai_task_steps_progress_check",
      sql`${table.progress} between 0 and 100`,
    ),
    attemptCheck: check(
      "ai_task_steps_attempt_check",
      sql`${table.attempt} >= 1`,
    ),
    taskFk: foreignKey({
      columns: [table.taskId],
      foreignColumns: [aiRewriteTasks.id],
      name: "ai_task_steps_taskId_ai_rewrite_tasks_id_fk",
    }).onDelete("cascade"),
  }),
);

export const aiSourceSites = pgTable(
  "ai_source_sites",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    siteUrl: text("siteUrl").notNull().unique(),
    feedUrl: text("feedUrl"),
    categoryId: integer("categoryId").notNull(),
    rewriteStyleId: integer("rewriteStyleId"),
    limit: integer("limit").default(10).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    lastRunAt: timestamp("lastRunAt"),
    lastDiscoveredCount: integer("lastDiscoveredCount").default(0).notNull(),
    lastCreatedCount: integer("lastCreatedCount").default(0).notNull(),
    lastSkippedCount: integer("lastSkippedCount").default(0).notNull(),
    lastRunDetails: text("lastRunDetails"),
    lastError: text("lastError"),
    runGeneration: integer("runGeneration").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    enabledIdx: index("ai_source_sites_enabled_idx").on(table.enabled),
    enabledIdIdx: index("ai_source_sites_enabled_id_idx").on(
      table.enabled,
      table.id,
    ),
    categoryFk: foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categories.id],
      name: "ai_source_sites_categoryId_categories_id_fk",
    }).onDelete("restrict"),
    rewriteStyleFk: foreignKey({
      columns: [table.rewriteStyleId],
      foreignColumns: [aiRewriteConfigs.id],
      name: "ai_source_sites_rewriteStyleId_ai_rewrite_configs_id_fk",
    }).onDelete("set null"),
    runGenerationCheck: check(
      "ai_source_sites_runGeneration_check",
      sql`${table.runGeneration} >= 0`,
    ),
  }),
);

export const imageGenerationConfigs = pgTable(
  "image_generation_configs",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    provider: varchar("provider", { length: 40 })
      .default("compatible")
      .notNull(),
    baseUrl: text("baseUrl").notNull(),
    apiKey: text("apiKey"),
    model: text("model").notNull(),
    promptTemplate: text("promptTemplate").notNull(),
    englishPromptTemplate: text("englishPromptTemplate"),
    size: varchar("size", { length: 40 }).default("1024x576").notNull(),
    quality: varchar("quality", { length: 40 }).default("standard").notNull(),
    timeoutSeconds: integer("timeoutSeconds").default(180).notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    isDefault: boolean("isDefault").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    enabledIdx: index("image_generation_configs_enabled_idx").on(table.enabled),
    singleDefault: uniqueIndex("image_generation_configs_single_default_unique")
      .on(table.isDefault)
      .where(sql`${table.isDefault} = true`),
    defaultRequiresEnabled: check(
      "image_generation_configs_default_requires_enabled",
      sql`NOT ${table.isDefault} OR ${table.enabled}`,
    ),
  }),
);

export const imageCoverGenerationTasks = pgTable(
  "image_cover_generation_tasks",
  {
    id: serial("id").primaryKey(),
    batchId: varchar("batchId", { length: 64 }).notNull(),
    postId: integer("postId").notNull(),
    title: text("title").notNull(),
    configId: integer("configId"),
    configName: text("configName"),
    provider: varchar("provider", { length: 40 }),
    model: text("model"),
    status: varchar("status", { length: 24 }).default("pending").notNull(),
    outputUrl: text("outputUrl"),
    assetId: integer("assetId"),
    errorTitle: text("errorTitle"),
    errorDetail: text("errorDetail"),
    createdBy: text("createdBy"),
    startedAt: timestamp("startedAt"),
    finishedAt: timestamp("finishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
    leaseOwner: varchar("leaseOwner", { length: 128 }),
    leaseExpiresAt: timestamp("leaseExpiresAt"),
    heartbeatAt: timestamp("heartbeatAt"),
  },
  (table) => ({
    batchIdx: index("image_cover_generation_tasks_batchId_idx").on(
      table.batchId,
    ),
    statusIdx: index("image_cover_generation_tasks_status_idx").on(
      table.status,
    ),
    statusCreatedAtIdx: index(
      "image_cover_generation_tasks_status_createdAt_idx",
    ).on(table.status, table.createdAt),
    statusLeaseExpiresAtIdx: index(
      "image_cover_generation_tasks_status_leaseExpiresAt_idx",
    ).on(table.status, table.leaseExpiresAt),
    postIdx: index("image_cover_generation_tasks_postId_idx").on(table.postId),
    configIdx: index("image_cover_generation_tasks_configId_idx").on(
      table.configId,
    ),
    statusCheck: check(
      "image_cover_generation_tasks_status_check",
      sql`${table.status} in ('pending', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    postFk: foreignKey({
      columns: [table.postId],
      foreignColumns: [posts.id],
      name: "image_cover_generation_tasks_postId_posts_id_fk",
    }).onDelete("cascade"),
    assetFk: foreignKey({
      columns: [table.assetId],
      foreignColumns: [imageAssets.id],
      name: "image_cover_generation_tasks_assetId_image_assets_id_fk",
    }).onDelete("set null"),
    configFk: foreignKey({
      columns: [table.configId],
      foreignColumns: [imageGenerationConfigs.id],
      name: "image_cover_generation_tasks_configId_image_generation_configs_id_fk",
    }).onDelete("set null"),
    creatorFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: "image_cover_generation_tasks_createdBy_users_id_fk",
    }).onDelete("set null"),
  }),
);

export const adminBackgroundJobs = pgTable(
  "admin_background_jobs",
  {
    id: serial("id").primaryKey(),
    jobKey: varchar("jobKey", { length: 180 }).notNull(),
    label: text("label").notNull(),
    status: varchar("status", { length: 24 }).default("queued").notNull(),
    payload: text("payload"),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("maxAttempts").default(3).notNull(),
    runAfter: timestamp("runAfter").defaultNow().notNull(),
    lockedBy: text("lockedBy"),
    lockedAt: timestamp("lockedAt"),
    heartbeatAt: timestamp("heartbeatAt"),
    lastError: text("lastError"),
    startedAt: timestamp("startedAt"),
    finishedAt: timestamp("finishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    jobKeyIdx: index("admin_background_jobs_jobKey_idx").on(table.jobKey),
    statusRunAfterIdx: index("admin_background_jobs_status_runAfter_idx").on(
      table.status,
      table.runAfter,
    ),
    lockedAtIdx: index("admin_background_jobs_lockedAt_idx").on(table.lockedAt),
    heartbeatAtIdx: index("admin_background_jobs_heartbeatAt_idx").on(
      table.heartbeatAt,
    ),
    statusCreatedAtIdx: index("admin_background_jobs_status_createdAt_idx").on(
      table.status,
      table.createdAt,
    ),
    queuedJobKeyUnique: uniqueIndex(
      "admin_background_jobs_queued_jobKey_unique",
    )
      .on(table.jobKey)
      .where(sql`${table.status} = 'queued'`),
    statusCheck: check(
      "admin_background_jobs_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    attemptsCheck: check(
      "admin_background_jobs_attempts_check",
      sql`${table.attempts} >= 0 and ${table.maxAttempts} between 1 and 100`,
    ),
  }),
);

export const outboundLinks = pgTable("outbound_links", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  targetUrl: text("targetUrl").notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt"),
});

export const serverRegions = pgTable(
  "server_regions",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    name: text("name").notNull(),
    enName: text("enName"),
    aliases: text("aliases"),
    countryCode: varchar("countryCode", { length: 16 }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    nameIdx: index("server_regions_name_idx").on(table.name),
    activeNameIdx: index("server_regions_active_name_idx").on(
      table.active,
      table.name,
    ),
  }),
);

export const serverNetworkLines = pgTable(
  "server_network_lines",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    name: text("name").notNull(),
    enName: text("enName"),
    aliases: text("aliases"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    nameIdx: index("server_network_lines_name_idx").on(table.name),
    activeNameIdx: index("server_network_lines_active_name_idx").on(
      table.active,
      table.name,
    ),
  }),
);

export const serverExchangeRates = pgTable(
  "server_exchange_rates",
  {
    currency: varchar("currency", { length: 16 }).primaryKey(),
    unitsPerUsd: numeric("unitsPerUsd", { precision: 18, scale: 8 }).notNull(),
    source: varchar("source", { length: 120 }).notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    enabledFetchedAtIdx: index(
      "server_exchange_rates_enabled_fetchedAt_idx",
    ).on(table.enabled, table.fetchedAt),
    currencyCheck: check(
      "server_exchange_rates_currency_check",
      sql`${table.currency} in ('USD', 'CNY', 'EUR', 'GBP', 'HKD', 'JPY', 'CAD', 'AUD')`,
    ),
    rateCheck: check(
      "server_exchange_rates_unitsPerUsd_check",
      sql`${table.unitsPerUsd} > 0`,
    ),
  }),
);

export const providerMonitors = pgTable(
  "provider_monitors",
  {
    id: serial("id").primaryKey(),
    providerId: integer("providerId").notNull(),
    name: text("name").notNull(),
    adapter: varchar("adapter", { length: 40 }).default("json").notNull(),
    purpose: varchar("purpose", { length: 24 }).default("catalog").notNull(),
    endpointUrl: text("endpointUrl").notNull(),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    autoPublish: boolean("autoPublish").default(false).notNull(),
    missingThreshold: integer("missingThreshold").default(3).notNull(),
    intervalMinutes: integer("intervalMinutes").default(30).notNull(),
    timeoutSeconds: integer("timeoutSeconds").default(30).notNull(),
    lastRunAt: timestamp("lastRunAt"),
    nextRunAt: timestamp("nextRunAt"),
    lastStatus: varchar("lastStatus", { length: 24 }).default("idle").notNull(),
    lastError: text("lastError"),
    etag: text("etag"),
    lastModified: text("lastModified"),
    responseHash: text("responseHash"),
    lastSummary: jsonb("lastSummary").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    providerIdx: index("provider_monitors_providerId_idx").on(table.providerId),
    idProviderUnique: unique("provider_monitors_id_providerId_unique").on(
      table.id,
      table.providerId,
    ),
    enabledNextRunIdx: index("provider_monitors_enabled_nextRunAt_idx").on(
      table.enabled,
      table.nextRunAt,
    ),
    providerNameUnique: unique("provider_monitors_providerId_name_unique").on(
      table.providerId,
      table.name,
    ),
    providerFk: foreignKey({
      columns: [table.providerId],
      foreignColumns: [affServiceProviders.id],
      name: "provider_monitors_providerId_aff_service_providers_id_fk",
    }).onDelete("cascade"),
    intervalCheck: check(
      "provider_monitors_intervalMinutes_check",
      sql`${table.intervalMinutes} between 1 and 10080`,
    ),
    timeoutCheck: check(
      "provider_monitors_timeoutSeconds_check",
      sql`${table.timeoutSeconds} between 1 and 300`,
    ),
    adapterCheck: check(
      "provider_monitors_adapter_check",
      sql`${table.adapter} in ('json', 'html', 'whmcs')`,
    ),
    purposeCheck: check(
      "provider_monitors_purpose_check",
      sql`${table.purpose} in ('catalog', 'promotion', 'stock')`,
    ),
    missingThresholdCheck: check(
      "provider_monitors_missingThreshold_check",
      sql`${table.missingThreshold} between 1 and 20`,
    ),
    lastStatusCheck: check(
      "provider_monitors_lastStatus_check",
      sql`${table.lastStatus} in ('idle', 'running', 'succeeded', 'failed')`,
    ),
  }),
);

export const providerMonitorRuns = pgTable(
  "provider_monitor_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    monitorId: integer("monitorId").notNull(),
    status: varchar("status", { length: 24 }).default("running").notNull(),
    httpStatus: integer("httpStatus"),
    responseHash: text("responseHash"),
    received: integer("received").default(0).notNull(),
    created: integer("created").default(0).notNull(),
    pending: integer("pending").default(0).notNull(),
    updated: integer("updated").default(0).notNull(),
    unchanged: integer("unchanged").default(0).notNull(),
    skipped: integer("skipped").default(0).notNull(),
    missing: integer("missing").default(0).notNull(),
    errorTitle: text("errorTitle"),
    errorDetail: text("errorDetail"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    finishedAt: timestamp("finishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    monitorIdx: index("provider_monitor_runs_monitorId_idx").on(
      table.monitorId,
    ),
    statusStartedAtIdx: index("provider_monitor_runs_status_startedAt_idx").on(
      table.status,
      table.startedAt,
    ),
    monitorStartedAtIdx: index(
      "provider_monitor_runs_monitorId_startedAt_idx",
    ).on(table.monitorId, table.startedAt),
    monitorFk: foreignKey({
      columns: [table.monitorId],
      foreignColumns: [providerMonitors.id],
      name: "provider_monitor_runs_monitorId_provider_monitors_id_fk",
    }).onDelete("cascade"),
    statusCheck: check(
      "provider_monitor_runs_status_check",
      sql`${table.status} in ('running', 'succeeded', 'failed')`,
    ),
    countersCheck: check(
      "provider_monitor_runs_counters_check",
      sql`least(
        ${table.received},
        ${table.created},
        ${table.pending},
        ${table.updated},
        ${table.unchanged},
        ${table.skipped},
        ${table.missing}
      ) >= 0`,
    ),
    httpStatusCheck: check(
      "provider_monitor_runs_httpStatus_check",
      sql`${table.httpStatus} is null or ${table.httpStatus} between 100 and 599`,
    ),
  }),
);

export const serverOffers = pgTable(
  "server_offers",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    slug: varchar("slug", { length: 360 }).notNull().unique(),
    externalProductId: text("externalProductId"),
    productGroup: text("productGroup"),
    offerKind: varchar("offerKind", { length: 24 })
      .default("regular")
      .notNull(),
    providerName: text("providerName"),
    providerId: integer("providerId"),
    sourceMonitorId: integer("sourceMonitorId"),
    sourceHash: text("sourceHash"),
    sourceLastSeenAt: timestamp("sourceLastSeenAt"),
    missingRuns: integer("missingRuns").default(0).notNull(),
    productType: varchar("productType", { length: 80 }).default("vps"),
    cpu: text("cpu"),
    memory: text("memory"),
    memoryMb: integer("memoryMb"),
    storage: text("storage"),
    storageGb: integer("storageGb"),
    storageType: varchar("storageType", { length: 80 }),
    bandwidth: text("bandwidth"),
    bandwidthMbps: integer("bandwidthMbps"),
    traffic: text("traffic"),
    trafficGb: integer("trafficGb"),
    region: text("region"),
    regionId: integer("regionId"),
    countryCode: varchar("countryCode", { length: 16 }),
    city: text("city"),
    lineType: text("lineType"),
    lineId: integer("lineId"),
    network: text("network"),
    ipv4: text("ipv4"),
    ipv6: text("ipv6"),
    priceAmount: numeric("priceAmount", { precision: 12, scale: 2 }),
    originalPriceAmount: numeric("originalPriceAmount", {
      precision: 12,
      scale: 2,
    }),
    currency: varchar("currency", { length: 16 }).default("USD"),
    billingCycle: varchar("billingCycle", { length: 40 }),
    monthlyPriceUsd: numeric("monthlyPriceUsd", { precision: 14, scale: 4 }),
    promoCode: text("promoCode"),
    purchaseUrl: text(),
    articleUrl: text(),
    reviewUrl: text(),
    sourcePostId: integer("sourcePostId"),
    status: varchar("status", { length: 24 }).default("in_stock").notNull(),
    checkStatus: varchar("checkStatus", { length: 24 })
      .default("unknown")
      .notNull(),
    statusChangedAt: timestamp("statusChangedAt"),
    lockedFields: jsonb("lockedFields")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    reviewStatus: varchar("reviewStatus", { length: 24 })
      .default("pending")
      .notNull(),
    duplicateKey: text("duplicateKey"),
    mergedIntoOfferId: integer("mergedIntoOfferId"),
    reviewedAt: timestamp("reviewedAt"),
    featured: boolean("featured").default(false).notNull(),
    visible: boolean("visible").default(true).notNull(),
    sortOrder: integer("sortOrder").default(0).notNull(),
    rawText: text("rawText"),
    lastCheckedAt: timestamp("lastCheckedAt"),
    validUntil: timestamp("validUntil"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    providerIdx: index("server_offers_providerId_idx").on(table.providerId),
    sourceMonitorIdx: index("server_offers_sourceMonitorId_idx").on(
      table.sourceMonitorId,
    ),
    regionIdIdx: index("server_offers_regionId_idx").on(table.regionId),
    lineIdIdx: index("server_offers_lineId_idx").on(table.lineId),
    sourcePostIdx: index("server_offers_sourcePostId_idx").on(
      table.sourcePostId,
    ),
    statusIdx: index("server_offers_status_idx").on(table.status),
    reviewStatusIdx: index("server_offers_reviewStatus_idx").on(
      table.reviewStatus,
    ),
    duplicateKeyIdx: index("server_offers_duplicateKey_idx").on(
      table.duplicateKey,
    ),
    mergedIntoOfferIdx: index("server_offers_mergedIntoOfferId_idx").on(
      table.mergedIntoOfferId,
    ),
    visibleIdx: index("server_offers_visible_idx").on(table.visible),
    regionIdx: index("server_offers_region_idx").on(table.region),
    lineTypeIdx: index("server_offers_lineType_idx").on(table.lineType),
    priceIdx: index("server_offers_priceAmount_idx").on(table.priceAmount),
    monthlyPriceIdx: index("server_offers_monthlyPriceUsd_idx").on(
      table.monthlyPriceUsd,
    ),
    visibleStatusFeaturedCreatedAtIdx: index(
      "server_offers_visible_status_featured_createdAt_idx",
    ).on(table.visible, table.status, table.featured, table.createdAt),
    visibleRegionPriceIdx: index("server_offers_visible_region_price_idx").on(
      table.visible,
      table.region,
      table.priceAmount,
    ),
    visibleProviderPriceIdx: index(
      "server_offers_visible_providerName_price_idx",
    ).on(table.visible, table.providerName, table.priceAmount),
    visibleLinePriceIdx: index("server_offers_visible_lineType_price_idx").on(
      table.visible,
      table.lineType,
      table.priceAmount,
    ),
    visibleStatusMonthlyPriceIdx: index(
      "server_offers_visible_status_monthlyPriceUsd_id_idx",
    ).on(table.visible, table.status, table.monthlyPriceUsd, table.id),
    visibleKindStatusMonthlyPriceIdx: index(
      "server_offers_visible_offerKind_status_monthlyPriceUsd_id_idx",
    ).on(
      table.visible,
      table.offerKind,
      table.status,
      table.monthlyPriceUsd,
      table.id,
    ),
    providerKindExternalProductIdx: index(
      "server_offers_providerId_offerKind_externalProductId_idx",
    ).on(table.providerId, table.offerKind, table.externalProductId),
    providerExternalProductUnique: uniqueIndex(
      "server_offers_providerId_externalProductId_unique",
    )
      .on(table.providerId, table.externalProductId)
      .where(
        sql`${table.providerId} is not null and ${table.externalProductId} is not null`,
      ),
    idProviderUnique: unique("server_offers_id_providerId_unique").on(
      table.id,
      table.providerId,
    ),
    statusCheck: check(
      "server_offers_status_check",
      sql`${table.status} in ('in_stock', 'out_of_stock', 'restocking', 'discontinued', 'preorder')`,
    ),
    offerKindCheck: check(
      "server_offers_offerKind_check",
      sql`${table.offerKind} in ('regular', 'promotion')`,
    ),
    checkStatusCheck: check(
      "server_offers_checkStatus_check",
      sql`${table.checkStatus} in ('ok', 'failed', 'unknown')`,
    ),
    reviewStatusCheck: check(
      "server_offers_reviewStatus_check",
      sql`${table.reviewStatus} in ('pending', 'reviewed', 'needs_fix', 'duplicate', 'merged')`,
    ),
    reviewTimestampCheck: check(
      "server_offers_reviewedAt_check",
      sql`(${table.reviewStatus} = 'pending' and ${table.reviewedAt} is null) or (${table.reviewStatus} <> 'pending' and ${table.reviewedAt} is not null)`,
    ),
    mergedTargetCheck: check(
      "server_offers_merged_target_check",
      sql`(${table.reviewStatus} = 'merged') = (${table.mergedIntoOfferId} is not null)`,
    ),
    mergedNotSelfCheck: check(
      "server_offers_merged_not_self_check",
      sql`${table.mergedIntoOfferId} is null or ${table.mergedIntoOfferId} <> ${table.id}`,
    ),
    sourceMonitorProviderCheck: check(
      "server_offers_sourceMonitor_provider_check",
      sql`${table.sourceMonitorId} is null or (${table.providerId} is not null and nullif(btrim(${table.externalProductId}), '') is not null)`,
    ),
    legacyPriceAmountCheck: check(
      "server_offers_priceAmount_check",
      sql`${table.priceAmount} is null or ${table.priceAmount} >= 0`,
    ),
    legacyOriginalPriceAmountCheck: check(
      "server_offers_originalPriceAmount_check",
      sql`${table.originalPriceAmount} is null or ${table.originalPriceAmount} >= 0`,
    ),
    legacyMonthlyPriceCheck: check(
      "server_offers_monthlyPriceUsd_check",
      sql`${table.monthlyPriceUsd} is null or ${table.monthlyPriceUsd} >= 0`,
    ),
    legacyCurrencyCheck: check(
      "server_offers_currency_check",
      sql`${table.currency} is null or ${table.currency} in ('USD', 'CNY', 'EUR', 'GBP', 'HKD', 'JPY', 'CAD', 'AUD')`,
    ),
    legacyBillingCycleCheck: check(
      "server_offers_billingCycle_check",
      sql`${table.billingCycle} is null or ${table.billingCycle} in ('monthly', 'quarterly', 'semiannual', 'yearly', 'biennial', 'triennial')`,
    ),
    lockedFieldsCheck: check(
      "server_offers_lockedFields_check",
      sql`jsonb_typeof(${table.lockedFields}) = 'array'`,
    ),
    providerFk: foreignKey({
      columns: [table.providerId],
      foreignColumns: [affServiceProviders.id],
      name: "server_offers_providerId_aff_service_providers_id_fk",
    }).onDelete("set null"),
    sourceMonitorFk: foreignKey({
      columns: [table.sourceMonitorId],
      foreignColumns: [providerMonitors.id],
      name: "server_offers_sourceMonitorId_provider_monitors_id_fk",
    }).onDelete("set null"),
    sourceMonitorProviderFk: foreignKey({
      columns: [table.sourceMonitorId, table.providerId],
      foreignColumns: [providerMonitors.id, providerMonitors.providerId],
      name: "server_offers_sourceMonitorId_providerId_provider_monitors_fk",
    }),
    mergedIntoOfferFk: foreignKey({
      columns: [table.mergedIntoOfferId],
      foreignColumns: [table.id],
      name: "server_offers_mergedIntoOfferId_server_offers_id_fk",
    }).onDelete("restrict"),
    missingRunsCheck: check(
      "server_offers_missingRuns_check",
      sql`${table.missingRuns} >= 0`,
    ),
    regionFk: foreignKey({
      columns: [table.regionId],
      foreignColumns: [serverRegions.id],
      name: "server_offers_regionId_server_regions_id_fk",
    }).onDelete("set null"),
    lineFk: foreignKey({
      columns: [table.lineId],
      foreignColumns: [serverNetworkLines.id],
      name: "server_offers_lineId_server_network_lines_id_fk",
    }).onDelete("set null"),
    sourcePostFk: foreignKey({
      columns: [table.sourcePostId],
      foreignColumns: [posts.id],
      name: "server_offers_sourcePostId_posts_id_fk",
    }).onDelete("set null"),
  }),
);

export const serverOfferPrices = pgTable(
  "server_offer_prices",
  {
    id: serial("id").primaryKey(),
    offerId: integer("offerId").notNull(),
    billingCycle: varchar("billingCycle", { length: 40 }).notNull(),
    termMonths: integer("termMonths").default(1).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    originalAmount: numeric("originalAmount", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 16 }).default("USD").notNull(),
    monthlyPriceUsd: numeric("monthlyPriceUsd", {
      precision: 14,
      scale: 4,
    }).notNull(),
    purchaseUrl: text("purchaseUrl"),
    active: boolean("active").default(true).notNull(),
    validUntil: timestamp("validUntil"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    offerIdx: index("server_offer_prices_offerId_idx").on(table.offerId),
    activeMonthlyIdx: index(
      "server_offer_prices_active_monthlyPriceUsd_idx",
    ).on(table.active, table.monthlyPriceUsd, table.offerId),
    offerCycleCurrencyUnique: unique(
      "server_offer_prices_offerId_billingCycle_currency_unique",
    ).on(table.offerId, table.billingCycle, table.currency),
    offerFk: foreignKey({
      columns: [table.offerId],
      foreignColumns: [serverOffers.id],
      name: "server_offer_prices_offerId_server_offers_id_fk",
    }).onDelete("cascade"),
    amountCheck: check(
      "server_offer_prices_amount_check",
      sql`${table.amount} >= 0`,
    ),
    originalAmountCheck: check(
      "server_offer_prices_originalAmount_check",
      sql`${table.originalAmount} is null or ${table.originalAmount} >= 0`,
    ),
    monthlyPriceCheck: check(
      "server_offer_prices_monthlyPriceUsd_check",
      sql`${table.monthlyPriceUsd} >= 0`,
    ),
    billingCycleCheck: check(
      "server_offer_prices_billingCycle_check",
      sql`${table.billingCycle} in ('monthly', 'quarterly', 'semiannual', 'yearly', 'biennial', 'triennial')`,
    ),
    currencyCheck: check(
      "server_offer_prices_currency_check",
      sql`${table.currency} in ('USD', 'CNY', 'EUR', 'GBP', 'HKD', 'JPY', 'CAD', 'AUD')`,
    ),
    termMonthsCheck: check(
      "server_offer_prices_termMonths_check",
      sql`${table.termMonths} between 1 and 120`,
    ),
    billingCycleTermCheck: check(
      "server_offer_prices_billingCycle_termMonths_check",
      sql`(${table.billingCycle} = 'monthly' and ${table.termMonths} = 1)
        or (${table.billingCycle} = 'quarterly' and ${table.termMonths} = 3)
        or (${table.billingCycle} = 'semiannual' and ${table.termMonths} = 6)
        or (${table.billingCycle} = 'yearly' and ${table.termMonths} = 12)
        or (${table.billingCycle} = 'biennial' and ${table.termMonths} = 24)
        or (${table.billingCycle} = 'triennial' and ${table.termMonths} = 36)`,
    ),
  }),
);

export const serverOfferTags = pgTable(
  "server_offer_tags",
  {
    offerId: integer("offerId").notNull(),
    slug: varchar("slug", { length: 160 }).notNull(),
    label: text("label").notNull(),
    kind: varchar("kind", { length: 40 }).default("feature").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.offerId, table.slug] }),
    slugIdx: index("server_offer_tags_slug_idx").on(table.slug),
    kindSlugIdx: index("server_offer_tags_kind_slug_idx").on(
      table.kind,
      table.slug,
    ),
    offerFk: foreignKey({
      columns: [table.offerId],
      foreignColumns: [serverOffers.id],
      name: "server_offer_tags_offerId_server_offers_id_fk",
    }).onDelete("cascade"),
  }),
);

export const serverOfferChecks = pgTable(
  "server_offer_checks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    offerId: integer("offerId").notNull(),
    monitorId: integer("monitorId"),
    status: varchar("status", { length: 24 }).notNull(),
    available: boolean("available"),
    priceAmount: numeric("priceAmount", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 16 }),
    responseTimeMs: integer("responseTimeMs"),
    error: text("error"),
    checkedAt: timestamp("checkedAt").defaultNow().notNull(),
  },
  (table) => ({
    offerCheckedAtIdx: index("server_offer_checks_offerId_checkedAt_idx").on(
      table.offerId,
      table.checkedAt,
    ),
    monitorCheckedAtIdx: index(
      "server_offer_checks_monitorId_checkedAt_idx",
    ).on(table.monitorId, table.checkedAt),
    checkedAtIdx: index("server_offer_checks_checkedAt_idx").on(
      table.checkedAt,
    ),
    offerFk: foreignKey({
      columns: [table.offerId],
      foreignColumns: [serverOffers.id],
      name: "server_offer_checks_offerId_server_offers_id_fk",
    }).onDelete("cascade"),
    monitorFk: foreignKey({
      columns: [table.monitorId],
      foreignColumns: [providerMonitors.id],
      name: "server_offer_checks_monitorId_provider_monitors_id_fk",
    }).onDelete("set null"),
    responseTimeCheck: check(
      "server_offer_checks_responseTimeMs_check",
      sql`${table.responseTimeMs} is null or ${table.responseTimeMs} >= 0`,
    ),
    statusCheck: check(
      "server_offer_checks_status_check",
      sql`${table.status} in ('ok', 'failed')`,
    ),
    priceAmountCheck: check(
      "server_offer_checks_priceAmount_check",
      sql`${table.priceAmount} is null or ${table.priceAmount} >= 0`,
    ),
    currencyCheck: check(
      "server_offer_checks_currency_check",
      sql`${table.currency} is null or ${table.currency} in ('USD', 'CNY', 'EUR', 'GBP', 'HKD', 'JPY', 'CAD', 'AUD')`,
    ),
  }),
);

export const serverOfferSources = pgTable(
  "server_offer_sources",
  {
    id: serial("id").primaryKey(),
    offerId: integer("offerId").notNull(),
    sourceType: varchar("sourceType", { length: 40 }).notNull(),
    sourcePostId: integer("sourcePostId"),
    sourceUrl: text("sourceUrl"),
    externalId: text("externalId"),
    relationType: varchar("relationType", { length: 24 }),
    priority: integer("priority").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    offerIdx: index("server_offer_sources_offerId_idx").on(table.offerId),
    postIdx: index("server_offer_sources_sourcePostId_idx").on(
      table.sourcePostId,
    ),
    externalIdx: index("server_offer_sources_externalId_idx").on(
      table.externalId,
    ),
    offerTypeExternalUnique: unique(
      "server_offer_sources_offerId_sourceType_externalId_unique",
    ).on(table.offerId, table.sourceType, table.externalId),
    articleRelationUnique: uniqueIndex(
      "server_offer_sources_article_relation_unique",
    )
      .on(table.offerId, table.sourcePostId, table.relationType)
      .where(
        sql`${table.sourceType} = 'article' and ${table.sourcePostId} is not null`,
      ),
    relationTypeCheck: check(
      "server_offer_sources_relationType_check",
      sql`${table.relationType} is null or ${table.relationType} in ('review', 'mention', 'deal')`,
    ),
    sourceTypeCheck: check(
      "server_offer_sources_sourceType_check",
      sql`${table.sourceType} in ('article', 'provider', 'monitor')`,
    ),
    relationScopeCheck: check(
      "server_offer_sources_relation_scope_check",
      sql`(${table.sourceType} = 'article' and ${table.relationType} is not null)
        or (${table.sourceType} <> 'article' and ${table.relationType} is null)`,
    ),
    providerExternalIdCheck: check(
      "server_offer_sources_provider_externalId_check",
      sql`${table.sourceType} <> 'provider' or nullif(btrim(${table.externalId}), '') is not null`,
    ),
    offerFk: foreignKey({
      columns: [table.offerId],
      foreignColumns: [serverOffers.id],
      name: "server_offer_sources_offerId_server_offers_id_fk",
    }).onDelete("cascade"),
    postFk: foreignKey({
      columns: [table.sourcePostId],
      foreignColumns: [posts.id],
      name: "server_offer_sources_sourcePostId_posts_id_fk",
    }).onDelete("set null"),
  }),
);

export const providerOfferCandidates = pgTable(
  "provider_offer_candidates",
  {
    id: serial("id").primaryKey(),
    monitorId: integer("monitorId").notNull(),
    providerId: integer("providerId").notNull(),
    externalProductId: text("externalProductId").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    sourceHash: text("sourceHash").notNull(),
    normalizedData: jsonb("normalizedData")
      .$type<Record<string, unknown>>()
      .notNull(),
    diff: jsonb("diff").$type<Record<string, unknown>>(),
    status: varchar("status", { length: 24 }).default("pending").notNull(),
    offerId: integer("offerId"),
    rejectionReason: text("rejectionReason"),
    reviewedBy: text("reviewedBy"),
    reviewedAt: timestamp("reviewedAt"),
    firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    monitorExternalUnique: unique(
      "provider_offer_candidates_monitorId_externalProductId_unique",
    ).on(table.monitorId, table.externalProductId),
    statusLastSeenIdx: index(
      "provider_offer_candidates_status_lastSeenAt_idx",
    ).on(table.status, table.lastSeenAt),
    providerIdx: index("provider_offer_candidates_providerId_idx").on(
      table.providerId,
    ),
    offerIdx: index("provider_offer_candidates_offerId_idx").on(table.offerId),
    monitorFk: foreignKey({
      columns: [table.monitorId],
      foreignColumns: [providerMonitors.id],
      name: "provider_offer_candidates_monitorId_provider_monitors_id_fk",
    }).onDelete("cascade"),
    providerFk: foreignKey({
      columns: [table.providerId],
      foreignColumns: [affServiceProviders.id],
      name: "provider_offer_candidates_providerId_aff_service_providers_id_fk",
    }).onDelete("cascade"),
    offerFk: foreignKey({
      columns: [table.offerId],
      foreignColumns: [serverOffers.id],
      name: "provider_offer_candidates_offerId_server_offers_id_fk",
    }).onDelete("set null"),
    monitorProviderFk: foreignKey({
      columns: [table.monitorId, table.providerId],
      foreignColumns: [providerMonitors.id, providerMonitors.providerId],
      name: "provider_offer_candidates_monitorId_providerId_provider_monitors_fk",
    }),
    offerProviderFk: foreignKey({
      columns: [table.offerId, table.providerId],
      foreignColumns: [serverOffers.id, serverOffers.providerId],
      name: "provider_offer_candidates_offerId_providerId_server_offers_fk",
    }),
    reviewerFk: foreignKey({
      columns: [table.reviewedBy],
      foreignColumns: [users.id],
      name: "provider_offer_candidates_reviewedBy_users_id_fk",
    }).onDelete("set null"),
    statusCheck: check(
      "provider_offer_candidates_status_check",
      sql`${table.status} in ('pending', 'accepted', 'rejected', 'superseded')`,
    ),
  }),
);

export const homepageSlots = pgTable(
  "homepage_slots",
  {
    id: serial("id").primaryKey(),
    language: varchar("language", { length: 8 }).default("zh").notNull(),
    placement: varchar("placement", { length: 40 }).notNull(),
    contentType: varchar("contentType", { length: 24 }).notNull(),
    postId: integer("postId"),
    offerId: integer("offerId"),
    imageAssetId: integer("imageAssetId"),
    title: text("title"),
    description: varchar("description", { length: 800 }),
    targetUrl: text("targetUrl"),
    altText: text("altText"),
    sortOrder: integer("sortOrder").default(0).notNull(),
    startsAt: timestamp("startsAt"),
    endsAt: timestamp("endsAt"),
    enabled: boolean("enabled").default(true).notNull(),
    trackingKey: varchar("trackingKey", { length: 160 }).unique(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    languagePlacementIdx: index(
      "homepage_slots_language_placement_enabled_sortOrder_idx",
    ).on(table.language, table.placement, table.enabled, table.sortOrder),
    scheduleIdx: index("homepage_slots_startsAt_endsAt_idx").on(
      table.startsAt,
      table.endsAt,
    ),
    postIdx: index("homepage_slots_postId_idx").on(table.postId),
    offerIdx: index("homepage_slots_offerId_idx").on(table.offerId),
    imageIdx: index("homepage_slots_imageAssetId_idx").on(table.imageAssetId),
    postFk: foreignKey({
      columns: [table.postId],
      foreignColumns: [posts.id],
      name: "homepage_slots_postId_posts_id_fk",
    }).onDelete("cascade"),
    offerFk: foreignKey({
      columns: [table.offerId],
      foreignColumns: [serverOffers.id],
      name: "homepage_slots_offerId_server_offers_id_fk",
    }).onDelete("cascade"),
    imageFk: foreignKey({
      columns: [table.imageAssetId],
      foreignColumns: [imageAssets.id],
      name: "homepage_slots_imageAssetId_image_assets_id_fk",
    }).onDelete("restrict"),
    contentCheck: check(
      "homepage_slots_content_check",
      sql`(${table.contentType} = 'post' and ${table.postId} is not null and ${table.offerId} is null)
        or (${table.contentType} = 'offer' and ${table.offerId} is not null and ${table.postId} is null)
        or (${table.contentType} = 'image_link' and ${table.imageAssetId} is not null and ${table.postId} is null and ${table.offerId} is null and nullif(btrim(${table.targetUrl}), '') is not null)`,
    ),
    scheduleCheck: check(
      "homepage_slots_schedule_check",
      sql`${table.endsAt} is null or ${table.startsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
    languageCheck: check(
      "homepage_slots_language_check",
      sql`${table.language} in ('zh', 'en')`,
    ),
    placementCheck: check(
      "homepage_slots_placement_check",
      sql`${table.placement} in ('hero_primary', 'promo_grid', 'featured_offers', 'sidebar')`,
    ),
  }),
);

export const knowledgeCategories = pgTable(
  "knowledge_categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    slug: varchar("slug", { length: 160 }).notNull().unique(),
    description: varchar("description", { length: 800 }),
    sortOrder: integer("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    sortOrderIdx: index("knowledge_categories_sortOrder_id_idx").on(
      table.sortOrder,
      table.id,
    ),
  }),
);

export const knowledgeArticles = pgTable(
  "knowledge_articles",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("categoryId").notNull(),
    title: text("title").notNull(),
    slug: varchar("slug", { length: 320 }).notNull().unique(),
    summary: varchar("summary", { length: 1_200 }),
    content: text("content").notNull(),
    keywords: text("keywords"),
    aliases: text("aliases"),
    retrievalTerms: text("retrievalTerms"),
    sourceNotes: text("sourceNotes"),
    published: boolean("published").default(false).notNull(),
    allowAiReference: boolean("allowAiReference").default(true).notNull(),
    publishedAt: timestamp("publishedAt"),
    createdBy: text("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    categoryIdx: index("knowledge_articles_categoryId_idx").on(
      table.categoryId,
    ),
    publishedCategoryUpdatedIdx: index(
      "knowledge_articles_published_category_updatedAt_idx",
    ).on(table.published, table.categoryId, table.updatedAt),
    aiReferenceIdx: index("knowledge_articles_aiReference_idx").on(
      table.published,
      table.allowAiReference,
    ),
    createdByIdx: index("knowledge_articles_createdBy_idx").on(table.createdBy),
    titleIdx: index("knowledge_articles_title_idx").on(table.title),
    categoryFk: foreignKey({
      columns: [table.categoryId],
      foreignColumns: [knowledgeCategories.id],
      name: "knowledge_articles_categoryId_knowledge_categories_id_fk",
    }).onDelete("restrict"),
    createdByFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: "knowledge_articles_createdBy_users_id_fk",
    }).onDelete("set null"),
    contentCheck: check(
      "knowledge_articles_content_check",
      sql`length(btrim(${table.content})) > 0`,
    ),
  }),
);

// Relations
export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [posts.categoryId],
    references: [categories.id],
  }),
  recommendedTag: one(tags, {
    fields: [posts.recommendedTagId],
    references: [tags.id],
  }),
  translationSourcePost: one(posts, {
    fields: [posts.translationSourcePostId],
    references: [posts.id],
    relationName: "post_translations",
  }),
  translations: many(posts, {
    relationName: "post_translations",
  }),
  tags: many(postTags),
  serverOffers: many(serverOffers),
  coverGenerationTasks: many(imageCoverGenerationTasks),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_hierarchy",
  }),
  children: many(categories, {
    relationName: "category_hierarchy",
  }),
  posts: many(posts),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  posts: many(postTags),
  recommendedPosts: many(posts),
}));

export const postTagsRelations = relations(postTags, ({ one }) => ({
  post: one(posts, {
    fields: [postTags.postId],
    references: [posts.id],
  }),
  tag: one(tags, {
    fields: [postTags.tagId],
    references: [tags.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  posts: many(posts),
  uploadedImages: many(imageAssets),
  reviewedProviderOfferCandidates: many(providerOfferCandidates),
  requestedProviderProfileSnapshots: many(providerProfileSnapshots, {
    relationName: "provider_profile_snapshot_requester",
  }),
  reviewedProviderProfileSnapshots: many(providerProfileSnapshots, {
    relationName: "provider_profile_snapshot_reviewer",
  }),
  auditLogs: many(adminAuditLogs),
  knowledgeArticles: many(knowledgeArticles),
}));

export const affServiceProvidersRelations = relations(
  affServiceProviders,
  ({ many }) => ({
    promoCodes: many(providerPromoCodes),
    profileSnapshots: many(providerProfileSnapshots),
  }),
);

export const providerPromoCodesRelations = relations(
  providerPromoCodes,
  ({ one }) => ({
    provider: one(affServiceProviders, {
      fields: [providerPromoCodes.providerId],
      references: [affServiceProviders.id],
    }),
  }),
);

export const providerProfileSnapshotsRelations = relations(
  providerProfileSnapshots,
  ({ one }) => ({
    provider: one(affServiceProviders, {
      fields: [providerProfileSnapshots.providerId],
      references: [affServiceProviders.id],
    }),
    requester: one(users, {
      fields: [providerProfileSnapshots.requestedBy],
      references: [users.id],
      relationName: "provider_profile_snapshot_requester",
    }),
    reviewer: one(users, {
      fields: [providerProfileSnapshots.reviewedBy],
      references: [users.id],
      relationName: "provider_profile_snapshot_reviewer",
    }),
  }),
);

export const knowledgeCategoriesRelations = relations(
  knowledgeCategories,
  ({ many }) => ({
    articles: many(knowledgeArticles),
  }),
);

export const knowledgeArticlesRelations = relations(
  knowledgeArticles,
  ({ one }) => ({
    category: one(knowledgeCategories, {
      fields: [knowledgeArticles.categoryId],
      references: [knowledgeCategories.id],
    }),
    creator: one(users, {
      fields: [knowledgeArticles.createdBy],
      references: [users.id],
    }),
  }),
);

export const adminAuditLogsRelations = relations(adminAuditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [adminAuditLogs.actorId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const imageAssetsRelations = relations(imageAssets, ({ one, many }) => ({
  uploader: one(users, {
    fields: [imageAssets.uploadedBy],
    references: [users.id],
  }),
  references: many(imageAssetReferences),
}));

export const imageAssetReferencesRelations = relations(
  imageAssetReferences,
  ({ one }) => ({
    image: one(imageAssets, {
      fields: [imageAssetReferences.imageId],
      references: [imageAssets.id],
    }),
  }),
);

export const imageCoverGenerationTasksRelations = relations(
  imageCoverGenerationTasks,
  ({ one }) => ({
    post: one(posts, {
      fields: [imageCoverGenerationTasks.postId],
      references: [posts.id],
    }),
    asset: one(imageAssets, {
      fields: [imageCoverGenerationTasks.assetId],
      references: [imageAssets.id],
    }),
    creator: one(users, {
      fields: [imageCoverGenerationTasks.createdBy],
      references: [users.id],
    }),
  }),
);

export const sourceMaterialsRelations = relations(
  sourceMaterials,
  ({ one, many }) => ({
    category: one(categories, {
      fields: [sourceMaterials.categoryId],
      references: [categories.id],
    }),
    rewriteStyle: one(aiRewriteConfigs, {
      fields: [sourceMaterials.rewriteStyleId],
      references: [aiRewriteConfigs.id],
    }),
    creator: one(users, {
      fields: [sourceMaterials.createdBy],
      references: [users.id],
    }),
    tasks: many(aiRewriteTasks),
  }),
);

export const aiRewriteTasksRelations = relations(
  aiRewriteTasks,
  ({ one, many }) => ({
    sourceMaterial: one(sourceMaterials, {
      fields: [aiRewriteTasks.sourceMaterialId],
      references: [sourceMaterials.id],
    }),
    category: one(categories, {
      fields: [aiRewriteTasks.categoryId],
      references: [categories.id],
    }),
    rewriteStyle: one(aiRewriteConfigs, {
      fields: [aiRewriteTasks.rewriteStyleId],
      references: [aiRewriteConfigs.id],
    }),
    post: one(posts, {
      fields: [aiRewriteTasks.postId],
      references: [posts.id],
    }),
    steps: many(aiTaskSteps),
  }),
);

export const aiTaskStepsRelations = relations(aiTaskSteps, ({ one }) => ({
  task: one(aiRewriteTasks, {
    fields: [aiTaskSteps.taskId],
    references: [aiRewriteTasks.id],
  }),
}));

export const serverOffersRelations = relations(
  serverOffers,
  ({ one, many }) => ({
    provider: one(affServiceProviders, {
      fields: [serverOffers.providerId],
      references: [affServiceProviders.id],
    }),
    sourceMonitor: one(providerMonitors, {
      fields: [serverOffers.sourceMonitorId],
      references: [providerMonitors.id],
    }),
    mergedIntoOffer: one(serverOffers, {
      fields: [serverOffers.mergedIntoOfferId],
      references: [serverOffers.id],
      relationName: "serverOfferMerge",
    }),
    mergedOffers: many(serverOffers, {
      relationName: "serverOfferMerge",
    }),
    sourcePost: one(posts, {
      fields: [serverOffers.sourcePostId],
      references: [posts.id],
    }),
    region: one(serverRegions, {
      fields: [serverOffers.regionId],
      references: [serverRegions.id],
    }),
    line: one(serverNetworkLines, {
      fields: [serverOffers.lineId],
      references: [serverNetworkLines.id],
    }),
    prices: many(serverOfferPrices),
    tags: many(serverOfferTags),
    checks: many(serverOfferChecks),
    sources: many(serverOfferSources),
    providerCandidates: many(providerOfferCandidates),
    homepageSlots: many(homepageSlots),
  }),
);

export const serverOfferPricesRelations = relations(
  serverOfferPrices,
  ({ one }) => ({
    offer: one(serverOffers, {
      fields: [serverOfferPrices.offerId],
      references: [serverOffers.id],
    }),
  }),
);

export const serverOfferTagsRelations = relations(
  serverOfferTags,
  ({ one }) => ({
    offer: one(serverOffers, {
      fields: [serverOfferTags.offerId],
      references: [serverOffers.id],
    }),
  }),
);

export const serverOfferChecksRelations = relations(
  serverOfferChecks,
  ({ one }) => ({
    offer: one(serverOffers, {
      fields: [serverOfferChecks.offerId],
      references: [serverOffers.id],
    }),
    monitor: one(providerMonitors, {
      fields: [serverOfferChecks.monitorId],
      references: [providerMonitors.id],
    }),
  }),
);

export const serverOfferSourcesRelations = relations(
  serverOfferSources,
  ({ one }) => ({
    offer: one(serverOffers, {
      fields: [serverOfferSources.offerId],
      references: [serverOffers.id],
    }),
    post: one(posts, {
      fields: [serverOfferSources.sourcePostId],
      references: [posts.id],
    }),
  }),
);

export const providerMonitorsRelations = relations(
  providerMonitors,
  ({ one, many }) => ({
    provider: one(affServiceProviders, {
      fields: [providerMonitors.providerId],
      references: [affServiceProviders.id],
    }),
    checks: many(serverOfferChecks),
    runs: many(providerMonitorRuns),
    candidates: many(providerOfferCandidates),
    offers: many(serverOffers),
  }),
);

export const providerMonitorRunsRelations = relations(
  providerMonitorRuns,
  ({ one }) => ({
    monitor: one(providerMonitors, {
      fields: [providerMonitorRuns.monitorId],
      references: [providerMonitors.id],
    }),
  }),
);

export const providerOfferCandidatesRelations = relations(
  providerOfferCandidates,
  ({ one }) => ({
    monitor: one(providerMonitors, {
      fields: [providerOfferCandidates.monitorId],
      references: [providerMonitors.id],
    }),
    provider: one(affServiceProviders, {
      fields: [providerOfferCandidates.providerId],
      references: [affServiceProviders.id],
    }),
    offer: one(serverOffers, {
      fields: [providerOfferCandidates.offerId],
      references: [serverOffers.id],
    }),
    reviewer: one(users, {
      fields: [providerOfferCandidates.reviewedBy],
      references: [users.id],
    }),
  }),
);

export const homepageSlotsRelations = relations(homepageSlots, ({ one }) => ({
  post: one(posts, {
    fields: [homepageSlots.postId],
    references: [posts.id],
  }),
  offer: one(serverOffers, {
    fields: [homepageSlots.offerId],
    references: [serverOffers.id],
  }),
  imageAsset: one(imageAssets, {
    fields: [homepageSlots.imageAssetId],
    references: [imageAssets.id],
  }),
}));
