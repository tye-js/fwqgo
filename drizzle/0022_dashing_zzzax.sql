ALTER TABLE "server_offers" ADD COLUMN IF NOT EXISTS "reviewStatus" varchar(24) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN IF NOT EXISTS "duplicateKey" text;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN IF NOT EXISTS "mergedIntoOfferId" integer;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN IF NOT EXISTS "reviewedAt" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_offers_reviewStatus_idx" ON "server_offers" USING btree ("reviewStatus");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_offers_duplicateKey_idx" ON "server_offers" USING btree ("duplicateKey");
