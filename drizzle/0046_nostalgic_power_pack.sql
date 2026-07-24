ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "rewriteMaxTokens" integer;--> statement-breakpoint
UPDATE "ai_rewrite_tasks" AS "task"
SET "rewriteMaxTokens" = "config"."maxTokens"
FROM "ai_rewrite_configs" AS "config"
WHERE "task"."rewriteStyleId" = "config"."id"
	AND "task"."rewriteMaxTokens" IS NULL;
