ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "requestStage" varchar(32) DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD CONSTRAINT "ai_rewrite_tasks_requestStage_check" CHECK ("ai_rewrite_tasks"."requestStage" in ('queued', 'request_started', 'response_received', 'checkpointed', 'manual_required'));--> statement-breakpoint
CREATE INDEX "ai_rewrite_tasks_requestStage_idx" ON "ai_rewrite_tasks" USING btree ("requestStage");--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD COLUMN "retryAfterAt" timestamp;--> statement-breakpoint
CREATE INDEX "image_cover_generation_tasks_status_retryAfterAt_idx" ON "image_cover_generation_tasks" USING btree ("status", "retryAfterAt");--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD CONSTRAINT "image_cover_generation_tasks_requestStage_check" CHECK ("image_cover_generation_tasks"."requestStage" in ('queued', 'prompt_persisted', 'request_started', 'response_received', 'asset_persisted', 'completed', 'failed', 'manual_required'));--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" DROP CONSTRAINT "image_cover_generation_tasks_postId_posts_id_fk";--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD CONSTRAINT "image_cover_generation_tasks_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE set null ON UPDATE no action;
