ALTER TABLE "image_assets" ADD COLUMN IF NOT EXISTS "thumbPath" text;--> statement-breakpoint
ALTER TABLE "image_assets" ADD COLUMN IF NOT EXISTS "largePath" text;