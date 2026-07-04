import { relations } from "drizzle-orm";
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
  unique,
  foreignKey,
  bigint,
  numeric,
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
    enTitle: text("enTitle"),
    enSlug: varchar("enSlug", { length: 320 }).unique(),
    enContent: text("enContent"),
    enKeywords: varchar("enKeywords", { length: 800 }),
    enDescription: varchar("enDescription", { length: 800 }),
    enImgUrl: text("enImgUrl"),
    enUpdatedAt: timestamp("enUpdatedAt"),
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
    publishedIdIdx: index("posts_published_id_idx").on(
      table.published,
      table.id,
    ),
    enSlugPublishedIdx: index("posts_enSlug_published_idx").on(
      table.enSlug,
      table.published,
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
    description: varchar("description", { length: 800 }),
    keywords: varchar("keywords", { length: 800 }),
    parentId: integer("parentId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    parentIdx: index("categories_parentId_idx").on(table.parentId),
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
    keywords: varchar("keywords", { length: 800 }),
    description: varchar("description", { length: 800 }),
    slug: text("slug").notNull().unique(),
    indexable: boolean("indexable").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    indexableIdx: index("tags_indexable_idx").on(table.indexable),
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

// Account table
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("userId").notNull(),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
    refresh_token_expires_in: integer("refresh_token_expires_in"),
  },
  (table) => ({
    providerProviderAccountIdKey: unique(
      "accounts_provider_providerAccountId_key",
    ).on(table.provider, table.providerAccountId),
    userFk: foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "accounts_userId_users_id_fk",
    }).onDelete("cascade"),
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
    userIdx: index("sessions_userId_idx").on(table.userId),
    userFk: foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "sessions_userId_users_id_fk",
    }).onDelete("cascade"),
  }),
);

// VerificationToken table
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull().unique(),
    expires: timestamp("expires").notNull(),
  },
  (table) => ({
    identifierTokenKey: unique("verification_tokens_identifier_token_key").on(
      table.identifier,
      table.token,
    ),
  }),
);

// AffServiceProvider table
export const affServiceProviders = pgTable(
  "aff_service_providers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    affUrl: text("affUrl").notNull(),
    affParam: text("affParam").notNull(),
    affValue: text("affValue").notNull(),
    officialUrl: text("officialUrl").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    officialUrlIdx: index("aff_service_providers_officialUrl_idx").on(
      table.officialUrl,
    ),
  }),
);

// Homepage promoted posts table
export const homepagePromotedPosts = pgTable(
  "homepage_promoted_posts",
  {
    id: serial("id").primaryKey(),
    postId: integer("postId").notNull().unique(),
    sortOrder: integer("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    postIdx: index("homepage_promoted_posts_postId_idx").on(table.postId),
    sortIdx: index("homepage_promoted_posts_sortOrder_idx").on(table.sortOrder),
    sortCreatedAtIdx: index(
      "homepage_promoted_posts_sortOrder_createdAt_idx",
    ).on(table.sortOrder, table.createdAt),
    postFk: foreignKey({
      columns: [table.postId],
      foreignColumns: [posts.id],
      name: "homepage_promoted_posts_postId_posts_id_fk",
    }).onDelete("cascade"),
  }),
);

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
    pathIdx: index("image_assets_path_idx").on(table.path),
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
    defaultIdx: index("ai_rewrite_configs_isDefault_idx").on(table.isDefault),
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
  },
  (table) => ({
    sourceMaterialIdx: index("ai_rewrite_tasks_sourceMaterialId_idx").on(
      table.sourceMaterialId,
    ),
    statusIdx: index("ai_rewrite_tasks_status_idx").on(table.status),
    createdAtIdx: index("ai_rewrite_tasks_createdAt_idx").on(table.createdAt),
    postIdx: index("ai_rewrite_tasks_postId_idx").on(table.postId),
    statusCreatedAtIdx: index("ai_rewrite_tasks_status_createdAt_idx").on(
      table.status,
      table.createdAt,
    ),
    sourceUrlCreatedAtIdx: index("ai_rewrite_tasks_sourceUrl_createdAt_idx").on(
      table.sourceUrl,
      table.createdAt,
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
    defaultIdx: index("image_generation_configs_isDefault_idx").on(
      table.isDefault,
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
  },
  (table) => ({
    batchIdx: index("image_cover_generation_tasks_batchId_idx").on(
      table.batchId,
    ),
    statusIdx: index("image_cover_generation_tasks_status_idx").on(
      table.status,
    ),
    postIdx: index("image_cover_generation_tasks_postId_idx").on(table.postId),
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
    creatorFk: foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: "image_cover_generation_tasks_createdBy_users_id_fk",
    }).onDelete("set null"),
  }),
);

export const outboundLinks = pgTable(
  "outbound_links",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    targetUrl: text("targetUrl").notNull().unique(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    slugIdx: index("outbound_links_slug_idx").on(table.slug),
    targetUrlIdx: index("outbound_links_targetUrl_idx").on(table.targetUrl),
  }),
);

export const serverOffers = pgTable(
  "server_offers",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    slug: varchar("slug", { length: 360 }).notNull().unique(),
    providerName: text("providerName"),
    providerId: integer("providerId"),
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
    countryCode: varchar("countryCode", { length: 16 }),
    city: text("city"),
    lineType: text("lineType"),
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
    promoCode: text("promoCode"),
    purchaseUrl: text(),
    articleUrl: text(),
    reviewUrl: text(),
    sourcePostId: integer("sourcePostId"),
    status: varchar("status", { length: 24 }).default("in_stock").notNull(),
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
    visibleIdx: index("server_offers_visible_idx").on(table.visible),
    regionIdx: index("server_offers_region_idx").on(table.region),
    lineTypeIdx: index("server_offers_lineType_idx").on(table.lineType),
    priceIdx: index("server_offers_priceAmount_idx").on(table.priceAmount),
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
    providerFk: foreignKey({
      columns: [table.providerId],
      foreignColumns: [affServiceProviders.id],
      name: "server_offers_providerId_aff_service_providers_id_fk",
    }).onDelete("set null"),
    sourcePostFk: foreignKey({
      columns: [table.sourcePostId],
      foreignColumns: [posts.id],
      name: "server_offers_sourcePostId_posts_id_fk",
    }).onDelete("set null"),
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

export const homepagePromotedPostsRelations = relations(
  homepagePromotedPosts,
  ({ one }) => ({
    post: one(posts, {
      fields: [homepagePromotedPosts.postId],
      references: [posts.id],
    }),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  posts: many(posts),
  uploadedImages: many(imageAssets),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
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

export const serverOffersRelations = relations(serverOffers, ({ one }) => ({
  provider: one(affServiceProviders, {
    fields: [serverOffers.providerId],
    references: [affServiceProviders.id],
  }),
  sourcePost: one(posts, {
    fields: [serverOffers.sourcePostId],
    references: [posts.id],
  }),
}));
