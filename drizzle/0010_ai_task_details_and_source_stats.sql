ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "scrapedTitle" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "scrapedDescription" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "scrapedHtml" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "aiInputLength" integer;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "rewriteOutputLength" integer;--> statement-breakpoint
ALTER TABLE "ai_source_sites" ADD COLUMN "lastDiscoveredCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_source_sites" ADD COLUMN "lastCreatedCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_source_sites" ADD COLUMN "lastSkippedCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_source_sites" ADD COLUMN "lastError" text;
