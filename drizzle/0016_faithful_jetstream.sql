ALTER TABLE "image_assets" ADD COLUMN IF NOT EXISTS "imageType" varchar(40) DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "image_assets" ADD COLUMN IF NOT EXISTS "status" varchar(24) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "image_assets" ADD COLUMN IF NOT EXISTS "altZh" text;--> statement-breakpoint
ALTER TABLE "image_assets" ADD COLUMN IF NOT EXISTS "altEn" text;--> statement-breakpoint
ALTER TABLE "image_assets" ADD COLUMN IF NOT EXISTS "sourceUrl" text;--> statement-breakpoint
ALTER TABLE "image_assets" ADD COLUMN IF NOT EXISTS "prompt" text;