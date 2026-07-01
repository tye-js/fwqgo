ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "sourceType" varchar(24) DEFAULT 'url' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "sourceTitle" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "sourceContent" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "sourceFileName" text;