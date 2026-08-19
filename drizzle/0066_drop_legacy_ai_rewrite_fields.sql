ALTER TABLE "ai_rewrite_configs" DROP CONSTRAINT IF EXISTS "ai_rewrite_configs_rewrite_max_attempts_check";--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" DROP COLUMN IF EXISTS "initialRewritePrompt";--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" DROP COLUMN IF EXISTS "rewriteRetryPrompt";--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" DROP COLUMN IF EXISTS "qualityRepairPrompt";--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" DROP COLUMN IF EXISTS "qualityReviewPrompt";--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" DROP COLUMN IF EXISTS "rewriteMaxAttempts";
