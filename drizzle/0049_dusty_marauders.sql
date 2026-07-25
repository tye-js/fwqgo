ALTER TABLE "ai_rewrite_configs" ADD COLUMN "qualityRepairPrompt" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" ADD COLUMN "rewriteMaxAttempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" ADD CONSTRAINT "ai_rewrite_configs_rewrite_max_attempts_check" CHECK ("ai_rewrite_configs"."rewriteMaxAttempts" between 2 and 10);
