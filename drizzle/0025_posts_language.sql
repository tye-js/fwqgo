ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "language" varchar(8) DEFAULT 'zh' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "translationSourcePostId" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "posts" ADD CONSTRAINT "posts_translationSourcePostId_posts_id_fk" FOREIGN KEY ("translationSourcePostId") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_language_idx" ON "posts" USING btree ("language");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_language_published_createdAt_idx" ON "posts" USING btree ("language","published","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_translationSourcePostId_idx" ON "posts" USING btree ("translationSourcePostId");
