ALTER TABLE "image_cover_generation_tasks" ALTER COLUMN "postId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD COLUMN "taskType" varchar(24) DEFAULT 'article_cover' NOT NULL;--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD COLUMN "inputSnapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD COLUMN "requestStage" varchar(32) DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" DROP CONSTRAINT "image_cover_generation_tasks_status_check";--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD CONSTRAINT "image_cover_generation_tasks_status_check" CHECK ("image_cover_generation_tasks"."status" in ('pending', 'running', 'succeeded', 'failed', 'uncertain', 'cancelled'));--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD CONSTRAINT "image_cover_generation_tasks_task_type_check" CHECK ("image_cover_generation_tasks"."taskType" in ('article_cover', 'standalone_cover', 'custom'));
