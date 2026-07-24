ALTER TABLE "image_cover_generation_tasks" ADD COLUMN "prompt" text;--> statement-breakpoint
UPDATE "image_cover_generation_tasks" AS "task"
SET "prompt" = "asset"."prompt"
FROM "image_assets" AS "asset"
WHERE "task"."assetId" = "asset"."id"
	AND "task"."prompt" IS NULL
	AND "asset"."prompt" IS NOT NULL;
