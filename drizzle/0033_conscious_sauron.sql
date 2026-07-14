ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "leaseOwner" varchar(128);--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "leaseExpiresAt" timestamp;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN "heartbeatAt" timestamp;--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD COLUMN "leaseOwner" varchar(128);--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD COLUMN "leaseExpiresAt" timestamp;--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD COLUMN "heartbeatAt" timestamp;--> statement-breakpoint
ALTER TABLE "server_offer_import_tasks" ADD COLUMN "leaseOwner" varchar(128);--> statement-breakpoint
ALTER TABLE "server_offer_import_tasks" ADD COLUMN "leaseExpiresAt" timestamp;--> statement-breakpoint
ALTER TABLE "server_offer_import_tasks" ADD COLUMN "heartbeatAt" timestamp;--> statement-breakpoint
CREATE INDEX "ai_rewrite_tasks_status_leaseExpiresAt_idx" ON "ai_rewrite_tasks" USING btree ("status","leaseExpiresAt");--> statement-breakpoint
CREATE INDEX "image_cover_generation_tasks_status_createdAt_idx" ON "image_cover_generation_tasks" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "image_cover_generation_tasks_status_leaseExpiresAt_idx" ON "image_cover_generation_tasks" USING btree ("status","leaseExpiresAt");--> statement-breakpoint
CREATE INDEX "posts_categoryId_language_published_createdAt_idx" ON "posts" USING btree ("categoryId","language","published","createdAt");--> statement-breakpoint
CREATE INDEX "posts_translationSource_language_published_updatedAt_idx" ON "posts" USING btree ("translationSourcePostId","language","published","updatedAt");--> statement-breakpoint
CREATE INDEX "server_offer_import_tasks_status_leaseExpiresAt_idx" ON "server_offer_import_tasks" USING btree ("status","leaseExpiresAt");