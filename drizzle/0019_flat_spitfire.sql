ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "enTitle" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "enSlug" varchar(320);--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "enContent" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "enKeywords" varchar(800);--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "enDescription" varchar(800);--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "enImgUrl" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "enUpdatedAt" timestamp;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "posts" ADD CONSTRAINT "posts_enSlug_unique" UNIQUE("enSlug");
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN null;
END $$;