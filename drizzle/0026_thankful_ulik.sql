CREATE TABLE "image_cover_generation_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"batchId" varchar(64) NOT NULL,
	"postId" integer NOT NULL,
	"title" text NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"outputUrl" text,
	"assetId" integer,
	"errorTitle" text,
	"errorDetail" text,
	"createdBy" text,
	"startedAt" timestamp,
	"finishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD CONSTRAINT "image_cover_generation_tasks_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD CONSTRAINT "image_cover_generation_tasks_assetId_image_assets_id_fk" FOREIGN KEY ("assetId") REFERENCES "public"."image_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_cover_generation_tasks" ADD CONSTRAINT "image_cover_generation_tasks_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "image_cover_generation_tasks_batchId_idx" ON "image_cover_generation_tasks" USING btree ("batchId");--> statement-breakpoint
CREATE INDEX "image_cover_generation_tasks_status_idx" ON "image_cover_generation_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "image_cover_generation_tasks_postId_idx" ON "image_cover_generation_tasks" USING btree ("postId");