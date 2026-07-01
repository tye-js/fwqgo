ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "affiliateReviewStatus" varchar(24) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "affiliateReviewDetails" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "affiliateReviewUpdatedAt" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_affiliateReviewStatus_idx" ON "posts" USING btree ("affiliateReviewStatus");
