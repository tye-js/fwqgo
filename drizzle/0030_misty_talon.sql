UPDATE "ai_rewrite_configs"
SET "isDefault" = false
WHERE "isDefault" = true AND "enabled" = false;--> statement-breakpoint
WITH ranked_defaults AS (
	SELECT "id", row_number() OVER (ORDER BY "id" DESC) AS "rank"
	FROM "ai_rewrite_configs"
	WHERE "enabled" = true AND "isDefault" = true
)
UPDATE "ai_rewrite_configs" AS config
SET "isDefault" = false
FROM ranked_defaults
WHERE config."id" = ranked_defaults."id" AND ranked_defaults."rank" > 1;--> statement-breakpoint
WITH fallback AS (
	SELECT "id"
	FROM "ai_rewrite_configs"
	WHERE "enabled" = true
	ORDER BY "id" DESC
	LIMIT 1
)
UPDATE "ai_rewrite_configs"
SET "isDefault" = true
WHERE "id" = (SELECT "id" FROM fallback)
	AND NOT EXISTS (
		SELECT 1
		FROM "ai_rewrite_configs"
		WHERE "enabled" = true AND "isDefault" = true
	);--> statement-breakpoint
UPDATE "image_generation_configs"
SET "isDefault" = false
WHERE "isDefault" = true AND "enabled" = false;--> statement-breakpoint
WITH ranked_defaults AS (
	SELECT "id", row_number() OVER (ORDER BY "id" DESC) AS "rank"
	FROM "image_generation_configs"
	WHERE "enabled" = true AND "isDefault" = true
)
UPDATE "image_generation_configs" AS config
SET "isDefault" = false
FROM ranked_defaults
WHERE config."id" = ranked_defaults."id" AND ranked_defaults."rank" > 1;--> statement-breakpoint
WITH fallback AS (
	SELECT "id"
	FROM "image_generation_configs"
	WHERE "enabled" = true
	ORDER BY "id" DESC
	LIMIT 1
)
UPDATE "image_generation_configs"
SET "isDefault" = true
WHERE "id" = (SELECT "id" FROM fallback)
	AND NOT EXISTS (
		SELECT 1
		FROM "image_generation_configs"
		WHERE "enabled" = true AND "isDefault" = true
	);--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "rewriteConfigName" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "rewriteProvider" varchar(40);--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "rewriteModel" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "imageConfigId" integer;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "imageConfigName" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "imageProvider" varchar(40);--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "imageModel" text;--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD COLUMN "configId" integer;--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD COLUMN "configName" text;--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD COLUMN "provider" varchar(40);--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD CONSTRAINT "image_cover_generation_tasks_configId_image_generation_configs_id_fk" FOREIGN KEY ("configId") REFERENCES "public"."image_generation_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_rewrite_configs_single_default_unique" ON "ai_rewrite_configs" USING btree ("isDefault") WHERE "ai_rewrite_configs"."isDefault" = true;--> statement-breakpoint
CREATE INDEX "ai_rewrite_tasks_imageConfigId_idx" ON "ai_rewrite_tasks" USING btree ("imageConfigId");--> statement-breakpoint
CREATE INDEX "image_cover_generation_tasks_configId_idx" ON "image_cover_generation_tasks" USING btree ("configId");--> statement-breakpoint
CREATE UNIQUE INDEX "image_generation_configs_single_default_unique" ON "image_generation_configs" USING btree ("isDefault") WHERE "image_generation_configs"."isDefault" = true;--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" ADD CONSTRAINT "ai_rewrite_configs_default_requires_enabled" CHECK (NOT "ai_rewrite_configs"."isDefault" OR "ai_rewrite_configs"."enabled");--> statement-breakpoint
ALTER TABLE "image_generation_configs" ADD CONSTRAINT "image_generation_configs_default_requires_enabled" CHECK (NOT "image_generation_configs"."isDefault" OR "image_generation_configs"."enabled");
