ALTER TABLE "aff_service_providers" ADD COLUMN "affiliateMode" varchar(24) DEFAULT 'query_param' NOT NULL;--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "affiliateProductParam" text;--> statement-breakpoint
UPDATE "aff_service_providers"
SET "affiliateMode" = 'full_replace'
WHERE btrim("affParam") = 'href';--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD CONSTRAINT "aff_service_providers_affiliateMode_check" CHECK ("aff_service_providers"."affiliateMode" in ('query_param', 'full_replace', 'product_param'));
