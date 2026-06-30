ALTER TABLE "image_assets" ADD COLUMN "imageType" varchar(40) DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "image_assets" ADD COLUMN "status" varchar(24) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "image_assets" ADD COLUMN "altZh" text;--> statement-breakpoint
ALTER TABLE "image_assets" ADD COLUMN "altEn" text;--> statement-breakpoint
ALTER TABLE "image_assets" ADD COLUMN "sourceUrl" text;--> statement-breakpoint
ALTER TABLE "image_assets" ADD COLUMN "prompt" text;