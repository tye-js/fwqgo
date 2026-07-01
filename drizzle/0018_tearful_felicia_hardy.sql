ALTER TABLE "ai_rewrite_tasks" ADD COLUMN IF NOT EXISTS "sourceType" varchar(24) DEFAULT 'url' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN IF NOT EXISTS "sourceTitle" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN IF NOT EXISTS "sourceContent" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN IF NOT EXISTS "sourceFileName" text;