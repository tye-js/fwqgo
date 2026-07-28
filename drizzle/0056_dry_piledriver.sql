ALTER TABLE "aff_service_providers" ADD COLUMN "offerAffUrl" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "offerAffParam" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "offerAffValue" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "offerAffiliateMode" varchar(24) DEFAULT 'query_param' NOT NULL;--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "offerAffiliateProductParam" text;--> statement-breakpoint
UPDATE "aff_service_providers"
SET
	"offerAffUrl" = "affUrl",
	"offerAffParam" = "affParam",
	"offerAffValue" = "affValue",
	"offerAffiliateMode" = "affiliateMode",
	"offerAffiliateProductParam" = "affiliateProductParam";--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD CONSTRAINT "aff_service_providers_offerAffiliateMode_check" CHECK ("aff_service_providers"."offerAffiliateMode" in ('query_param', 'full_replace', 'product_param'));
