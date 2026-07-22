CREATE TABLE "admin_audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actorId" text,
	"action" varchar(160) NOT NULL,
	"entityType" varchar(80) NOT NULL,
	"entityId" varchar(160),
	"status" varchar(16) NOT NULL,
	"requestId" varchar(120),
	"metadata" jsonb,
	"error" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_logs_status_check" CHECK ("admin_audit_logs"."status" in ('success', 'failure'))
);
--> statement-breakpoint
CREATE TABLE "server_exchange_rates" (
	"currency" varchar(16) PRIMARY KEY NOT NULL,
	"unitsPerUsd" numeric(18, 8) NOT NULL,
	"source" varchar(120) NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "server_exchange_rates_currency_check" CHECK ("server_exchange_rates"."currency" in ('USD', 'CNY', 'EUR', 'GBP', 'HKD', 'JPY', 'CAD', 'AUD')),
	CONSTRAINT "server_exchange_rates_unitsPerUsd_check" CHECK ("server_exchange_rates"."unitsPerUsd" > 0)
);
--> statement-breakpoint
INSERT INTO "server_exchange_rates" ("currency", "unitsPerUsd", "source", "fetchedAt", "enabled", "createdAt", "updatedAt")
VALUES
	('USD', 1, 'initial migration', now(), true, now(), now()),
	('CNY', 7.2, 'initial migration', now(), true, now(), now()),
	('EUR', 0.92, 'initial migration', now(), true, now(), now()),
	('GBP', 0.79, 'initial migration', now(), true, now(), now()),
	('HKD', 7.8, 'initial migration', now(), true, now(), now()),
	('JPY', 150, 'initial migration', now(), true, now(), now()),
	('CAD', 1.36, 'initial migration', now(), true, now(), now()),
	('AUD', 1.52, 'initial migration', now(), true, now(), now())
ON CONFLICT ("currency") DO NOTHING;--> statement-breakpoint

INSERT INTO "homepage_slots" (
	"language",
	"placement",
	"contentType",
	"postId",
	"sortOrder",
	"enabled",
	"trackingKey",
	"createdAt",
	"updatedAt"
)
SELECT
	CASE WHEN old."language" = 'en' THEN 'en' ELSE 'zh' END,
	'sidebar',
	'post',
	old."postId",
	old."sortOrder",
	true,
	'legacy-homepage-promoted-' || old."id",
	old."createdAt",
	now()
FROM "homepage_promoted_posts" old
WHERE EXISTS (
		SELECT 1
		FROM "posts" post
		WHERE post."id" = old."postId"
	)
	AND NOT EXISTS (
		SELECT 1
		FROM "homepage_slots" slot
		WHERE slot."language" = CASE WHEN old."language" = 'en' THEN 'en' ELSE 'zh' END
			AND slot."placement" = 'sidebar'
			AND slot."contentType" = 'post'
			AND slot."postId" = old."postId"
	);--> statement-breakpoint

WITH ranked_english AS (
	SELECT
		source.*,
		row_number() OVER (
			PARTITION BY btrim(source."enSlug")
			ORDER BY source."id"
		) AS "slugRank"
	FROM "posts" source
	WHERE source."language" = 'zh'
		AND nullif(btrim(source."enTitle"), '') IS NOT NULL
		AND nullif(btrim(source."enSlug"), '') IS NOT NULL
		AND nullif(btrim(source."enContent"), '') IS NOT NULL
		AND NOT EXISTS (
			SELECT 1
			FROM "posts" existing_translation
			WHERE existing_translation."translationSourcePostId" = source."id"
				AND existing_translation."language" = 'en'
		)
), legacy_english AS (
	SELECT
		ranked.*,
		CASE
			WHEN ranked."slugRank" > 1 OR EXISTS (
				SELECT 1 FROM "posts" existing
				WHERE existing."slug" = btrim(ranked."enSlug")
			)
			THEN left(
				btrim(ranked."enSlug"),
				greatest(1, 320 - length('-legacy-en-' || ranked."id"))
			) || '-legacy-en-' || ranked."id"
			ELSE btrim(ranked."enSlug")
		END AS "targetSlug"
	FROM ranked_english ranked
)
INSERT INTO "posts" (
	"title",
	"slug",
	"content",
	"keywords",
	"description",
	"imgUrl",
	"language",
	"affiliateReviewStatus",
	"affiliateReviewDetails",
	"affiliateReviewUpdatedAt",
	"published",
	"createdAt",
	"updatedAt",
	"views",
	"recommendedTagName",
	"recommendedTagId",
	"translationSourcePostId",
	"authorId",
	"categoryId"
)
SELECT
	btrim("enTitle"),
	"targetSlug",
	"enContent",
	nullif(btrim("enKeywords"), ''),
	nullif(btrim("enDescription"), ''),
	nullif(btrim("enImgUrl"), ''),
	'en',
	"affiliateReviewStatus",
	"affiliateReviewDetails",
	"affiliateReviewUpdatedAt",
	"published",
	coalesce("enUpdatedAt", "updatedAt", "createdAt", now()),
	coalesce("enUpdatedAt", "updatedAt", now()),
	0,
	"recommendedTagName",
	"recommendedTagId",
	"id",
	"authorId",
	"categoryId"
FROM legacy_english
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

UPDATE "homepage_slots" slot
SET "postId" = english."id", "updatedAt" = now()
FROM "posts" source
INNER JOIN "posts" english
	ON english."translationSourcePostId" = source."id"
	AND english."language" = 'en'
WHERE slot."trackingKey" LIKE 'legacy-homepage-promoted-%'
	AND slot."language" = 'en'
	AND slot."contentType" = 'post'
	AND slot."postId" = source."id";--> statement-breakpoint

INSERT INTO "post_tags" ("postId", "tagId", "createdAt")
SELECT
	english."id",
	source_tags."tagId",
	coalesce(source_tags."createdAt", now())
FROM "posts" source
INNER JOIN "posts" english
	ON english."translationSourcePostId" = source."id"
	AND english."language" = 'en'
INNER JOIN "post_tags" source_tags
	ON source_tags."postId" = source."id"
WHERE source."language" = 'zh'
	AND nullif(btrim(source."enTitle"), '') IS NOT NULL
	AND nullif(btrim(source."enSlug"), '') IS NOT NULL
	AND nullif(btrim(source."enContent"), '') IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "image_asset_references" (
	"imageId",
	"sourceType",
	"sourceId",
	"sourceLabel",
	"field",
	"createdAt",
	"updatedAt"
)
SELECT
	asset."id",
	'post',
	english."id"::text,
	english."title",
	'imgUrl',
	now(),
	now()
FROM "posts" english
INNER JOIN "image_assets" asset
	ON english."imgUrl" = asset."path"
	OR english."imgUrl" LIKE '%' || asset."path" || '%'
WHERE english."language" = 'en'
	AND nullif(btrim(english."imgUrl"), '') IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "image_asset_references" (
	"imageId",
	"sourceType",
	"sourceId",
	"sourceLabel",
	"field",
	"createdAt",
	"updatedAt"
)
SELECT
	asset."id",
	'post',
	english."id"::text,
	english."title",
	'content',
	now(),
	now()
FROM "posts" english
INNER JOIN "image_assets" asset
	ON english."content" LIKE '%' || asset."path" || '%'
WHERE english."language" = 'en'
ON CONFLICT DO NOTHING;--> statement-breakpoint

ALTER TABLE "accounts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "homepage_promoted_posts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "server_offer_import_tasks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "accounts" CASCADE;--> statement-breakpoint
DROP TABLE "homepage_promoted_posts" CASCADE;--> statement-breakpoint
DROP TABLE "server_offer_import_tasks" CASCADE;--> statement-breakpoint
DROP TABLE "verification_tokens" CASCADE;--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_enSlug_unique";--> statement-breakpoint
ALTER TABLE "server_offer_checks" DROP CONSTRAINT "server_offer_checks_currency_check";--> statement-breakpoint
ALTER TABLE "server_offer_prices" DROP CONSTRAINT "server_offer_prices_currency_check";--> statement-breakpoint
ALTER TABLE "server_offers" DROP CONSTRAINT "server_offers_currency_check";--> statement-breakpoint
DROP INDEX "aff_service_providers_slug_idx";--> statement-breakpoint
DROP INDEX "ai_rewrite_configs_isDefault_idx";--> statement-breakpoint
DROP INDEX "image_assets_path_idx";--> statement-breakpoint
DROP INDEX "image_generation_configs_isDefault_idx";--> statement-breakpoint
DROP INDEX "outbound_links_slug_idx";--> statement-breakpoint
DROP INDEX "outbound_links_targetUrl_idx";--> statement-breakpoint
DROP INDEX "posts_enSlug_published_idx";--> statement-breakpoint
DROP INDEX "site_seo_configs_language_idx";--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_logs_actorId_createdAt_idx" ON "admin_audit_logs" USING btree ("actorId","createdAt");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_action_createdAt_idx" ON "admin_audit_logs" USING btree ("action","createdAt");--> statement-breakpoint
CREATE INDEX "admin_audit_logs_entity_idx" ON "admin_audit_logs" USING btree ("entityType","entityId","createdAt");--> statement-breakpoint
CREATE INDEX "server_exchange_rates_enabled_fetchedAt_idx" ON "server_exchange_rates" USING btree ("enabled","fetchedAt");--> statement-breakpoint
UPDATE "posts"
SET
	"language" = CASE WHEN "language" = 'en' THEN 'en' ELSE 'zh' END,
	"affiliateReviewStatus" = CASE
		WHEN "affiliateReviewStatus" IN ('pending', 'manual_required', 'passed') THEN "affiliateReviewStatus"
		ELSE 'pending'
	END,
	"translationSourcePostId" = CASE WHEN "language" = 'en' THEN "translationSourcePostId" ELSE NULL END;--> statement-breakpoint

WITH duplicate_translations AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "translationSourcePostId", "language"
			ORDER BY "published" DESC, "updatedAt" DESC NULLS LAST, "createdAt" DESC, "id" DESC
		) AS "rowNumber"
	FROM "posts"
	WHERE "translationSourcePostId" IS NOT NULL
)
UPDATE "posts" post
SET "translationSourcePostId" = NULL
FROM duplicate_translations duplicate
WHERE post."id" = duplicate."id"
	AND duplicate."rowNumber" > 1;--> statement-breakpoint

UPDATE "admin_background_jobs"
SET
	"status" = CASE
		WHEN "status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled') THEN "status"
		ELSE 'failed'
	END,
	"attempts" = greatest("attempts", 0),
	"maxAttempts" = least(greatest("maxAttempts", 1), 100);--> statement-breakpoint

UPDATE "ai_rewrite_tasks"
SET
	"status" = CASE
		WHEN "status" IN ('pending', 'running', 'succeeded', 'failed', 'manual_required', 'cancelled') THEN "status"
		ELSE 'failed'
	END,
	"sourceType" = CASE
		WHEN "sourceType" IN ('url', 'text', 'email', 'file', 'english', 'seo') THEN "sourceType"
		ELSE 'url'
	END,
	"progress" = least(greatest("progress", 0), 100),
	"attempts" = greatest("attempts", 0);--> statement-breakpoint

UPDATE "ai_task_steps"
SET
	"status" = CASE
		WHEN "status" IN ('pending', 'running', 'success', 'failed', 'skipped', 'manual_required') THEN "status"
		ELSE 'failed'
	END,
	"progress" = least(greatest("progress", 0), 100),
	"attempt" = greatest("attempt", 1);--> statement-breakpoint

UPDATE "image_assets"
SET
	"imageType" = CASE
		WHEN "imageType" IN ('upload', 'ai_cover', 'ai_generated', 'provider', 'post_cover') THEN "imageType"
		ELSE 'upload'
	END,
	"status" = CASE
		WHEN "status" IN ('active', 'archived', 'missing') THEN "status"
		ELSE 'active'
	END;--> statement-breakpoint

UPDATE "image_cover_generation_tasks"
SET "status" = CASE
	WHEN "status" IN ('pending', 'running', 'succeeded', 'failed', 'cancelled') THEN "status"
	ELSE 'failed'
END;--> statement-breakpoint

UPDATE "source_materials"
SET
	"materialType" = CASE
		WHEN "materialType" IN ('url', 'text', 'email', 'file') THEN "materialType"
		ELSE 'text'
	END,
	"status" = CASE
		WHEN "status" IN ('queued', 'running', 'succeeded', 'failed', 'manual_required', 'cancelled', 'deleted') THEN "status"
		ELSE 'failed'
	END;--> statement-breakpoint

UPDATE "server_offer_checks"
SET "currency" = CASE
	WHEN "currency" IS NULL OR btrim("currency") = '' THEN NULL
	WHEN upper(btrim("currency")) IN ('USD', 'CNY', 'EUR', 'GBP', 'HKD', 'JPY', 'CAD', 'AUD') THEN upper(btrim("currency"))
	ELSE NULL
END;--> statement-breakpoint

UPDATE "server_offer_prices"
SET "currency" = CASE
	WHEN upper(btrim("currency")) IN ('USD', 'CNY', 'EUR', 'GBP', 'HKD', 'JPY', 'CAD', 'AUD') THEN upper(btrim("currency"))
	ELSE 'USD'
END;--> statement-breakpoint

UPDATE "server_offers"
SET "currency" = CASE
	WHEN "currency" IS NULL OR btrim("currency") = '' THEN NULL
	WHEN upper(btrim("currency")) IN ('USD', 'CNY', 'EUR', 'GBP', 'HKD', 'JPY', 'CAD', 'AUD') THEN upper(btrim("currency"))
	ELSE NULL
END;--> statement-breakpoint

CREATE UNIQUE INDEX "posts_translationSource_language_unique" ON "posts" USING btree ("translationSourcePostId","language") WHERE "posts"."translationSourcePostId" is not null;--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "enTitle";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "enSlug";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "enContent";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "enKeywords";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "enDescription";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "enImgUrl";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "enUpdatedAt";--> statement-breakpoint
ALTER TABLE "admin_background_jobs" ADD CONSTRAINT "admin_background_jobs_status_check" CHECK ("admin_background_jobs"."status" in ('queued', 'running', 'succeeded', 'failed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "admin_background_jobs" ADD CONSTRAINT "admin_background_jobs_attempts_check" CHECK ("admin_background_jobs"."attempts" >= 0 and "admin_background_jobs"."maxAttempts" between 1 and 100);--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD CONSTRAINT "ai_rewrite_tasks_status_check" CHECK ("ai_rewrite_tasks"."status" in ('pending', 'running', 'succeeded', 'failed', 'manual_required', 'cancelled'));--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD CONSTRAINT "ai_rewrite_tasks_sourceType_check" CHECK ("ai_rewrite_tasks"."sourceType" in ('url', 'text', 'email', 'file', 'english', 'seo'));--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD CONSTRAINT "ai_rewrite_tasks_progress_check" CHECK ("ai_rewrite_tasks"."progress" between 0 and 100);--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD CONSTRAINT "ai_rewrite_tasks_attempts_check" CHECK ("ai_rewrite_tasks"."attempts" >= 0);--> statement-breakpoint
ALTER TABLE "ai_task_steps" ADD CONSTRAINT "ai_task_steps_status_check" CHECK ("ai_task_steps"."status" in ('pending', 'running', 'success', 'failed', 'skipped', 'manual_required'));--> statement-breakpoint
ALTER TABLE "ai_task_steps" ADD CONSTRAINT "ai_task_steps_progress_check" CHECK ("ai_task_steps"."progress" between 0 and 100);--> statement-breakpoint
ALTER TABLE "ai_task_steps" ADD CONSTRAINT "ai_task_steps_attempt_check" CHECK ("ai_task_steps"."attempt" >= 1);--> statement-breakpoint
ALTER TABLE "image_assets" ADD CONSTRAINT "image_assets_imageType_check" CHECK ("image_assets"."imageType" in ('upload', 'ai_cover', 'ai_generated', 'provider', 'post_cover'));--> statement-breakpoint
ALTER TABLE "image_assets" ADD CONSTRAINT "image_assets_status_check" CHECK ("image_assets"."status" in ('active', 'archived', 'missing'));--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD CONSTRAINT "image_cover_generation_tasks_status_check" CHECK ("image_cover_generation_tasks"."status" in ('pending', 'running', 'succeeded', 'failed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_language_check" CHECK ("posts"."language" in ('zh', 'en'));--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_translation_direction_check" CHECK ("posts"."language" <> 'zh' or "posts"."translationSourcePostId" is null);--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_affiliateReviewStatus_check" CHECK ("posts"."affiliateReviewStatus" in ('pending', 'manual_required', 'passed'));--> statement-breakpoint
ALTER TABLE "server_offer_checks" ADD CONSTRAINT "server_offer_checks_currency_check" CHECK ("server_offer_checks"."currency" is null or "server_offer_checks"."currency" in ('USD', 'CNY', 'EUR', 'GBP', 'HKD', 'JPY', 'CAD', 'AUD'));--> statement-breakpoint
ALTER TABLE "server_offer_prices" ADD CONSTRAINT "server_offer_prices_currency_check" CHECK ("server_offer_prices"."currency" in ('USD', 'CNY', 'EUR', 'GBP', 'HKD', 'JPY', 'CAD', 'AUD'));--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_currency_check" CHECK ("server_offers"."currency" is null or "server_offers"."currency" in ('USD', 'CNY', 'EUR', 'GBP', 'HKD', 'JPY', 'CAD', 'AUD'));--> statement-breakpoint
ALTER TABLE "source_materials" ADD CONSTRAINT "source_materials_materialType_check" CHECK ("source_materials"."materialType" in ('url', 'text', 'email', 'file'));--> statement-breakpoint
ALTER TABLE "source_materials" ADD CONSTRAINT "source_materials_status_check" CHECK ("source_materials"."status" in ('queued', 'running', 'succeeded', 'failed', 'manual_required', 'cancelled', 'deleted'));
