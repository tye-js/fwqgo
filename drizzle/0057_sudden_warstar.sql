CREATE TABLE "affiliate_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"providerId" integer NOT NULL,
	"externalProductId" varchar(160) NOT NULL,
	"affiliateTargetUrl" text NOT NULL,
	"sourceUrl" text,
	"outboundLinkId" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"verifiedAt" timestamp,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "affiliate_links_providerId_externalProductId_unique" UNIQUE("providerId","externalProductId"),
	CONSTRAINT "affiliate_links_providerId_outboundLinkId_unique" UNIQUE("providerId","outboundLinkId"),
	CONSTRAINT "affiliate_links_externalProductId_check" CHECK (length(trim("affiliate_links"."externalProductId")) > 0)
);
--> statement-breakpoint
ALTER TABLE "provider_monitors" DROP CONSTRAINT "provider_monitors_adapter_check";--> statement-breakpoint
UPDATE "provider_offer_candidates"
SET
	"status" = 'superseded',
	"rejectionReason" = '旧采集方式已停用，请补录完整返利链接',
	"updatedAt" = now()
WHERE "status" = 'pending'
	AND "monitorId" IN (
		SELECT "id"
		FROM "provider_monitors"
		WHERE "adapter" = 'product_links'
	);--> statement-breakpoint
UPDATE "provider_monitors"
SET
	"adapter" = 'affiliate_link',
	"config" = '{}'::jsonb,
	"enabled" = false,
	"nextRunAt" = NULL,
	"lastStatus" = 'idle',
	"lastError" = '旧采集方式已停用，请补录完整返利链接',
	"runGeneration" = "runGeneration" + 1,
	"updatedAt" = now()
WHERE "adapter" = 'product_links';--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD COLUMN "affiliateLinkId" integer;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_providerId_aff_service_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."aff_service_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_outboundLinkId_outbound_links_id_fk" FOREIGN KEY ("outboundLinkId") REFERENCES "public"."outbound_links"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_links_providerId_idx" ON "affiliate_links" USING btree ("providerId");--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD CONSTRAINT "provider_monitors_affiliateLinkId_affiliate_links_id_fk" FOREIGN KEY ("affiliateLinkId") REFERENCES "public"."affiliate_links"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD CONSTRAINT "provider_monitors_affiliateLinkId_unique" UNIQUE("affiliateLinkId");--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD CONSTRAINT "provider_monitors_adapter_check" CHECK ("provider_monitors"."adapter" in ('json', 'html', 'whmcs', 'affiliate_link'));
