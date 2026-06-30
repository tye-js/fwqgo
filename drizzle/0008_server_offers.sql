CREATE TABLE "server_offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" varchar(360) NOT NULL,
	"providerName" text,
	"providerId" integer,
	"productType" varchar(80) DEFAULT 'vps',
	"cpu" text,
	"memory" text,
	"memoryMb" integer,
	"storage" text,
	"storageGb" integer,
	"storageType" varchar(80),
	"bandwidth" text,
	"bandwidthMbps" integer,
	"traffic" text,
	"trafficGb" integer,
	"region" text,
	"countryCode" varchar(16),
	"city" text,
	"lineType" text,
	"network" text,
	"ipv4" text,
	"ipv6" text,
	"priceAmount" numeric(12, 2),
	"originalPriceAmount" numeric(12, 2),
	"currency" varchar(16) DEFAULT 'USD',
	"billingCycle" varchar(40),
	"promoCode" text,
	"purchaseUrl" text,
	"articleUrl" text,
	"reviewUrl" text,
	"sourcePostId" integer,
	"status" varchar(24) DEFAULT 'in_stock' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"rawText" text,
	"lastCheckedAt" timestamp,
	"validUntil" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "server_offers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "server_offers_providerId_idx" ON "server_offers" USING btree ("providerId");--> statement-breakpoint
CREATE INDEX "server_offers_sourcePostId_idx" ON "server_offers" USING btree ("sourcePostId");--> statement-breakpoint
CREATE INDEX "server_offers_status_idx" ON "server_offers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "server_offers_visible_idx" ON "server_offers" USING btree ("visible");--> statement-breakpoint
CREATE INDEX "server_offers_region_idx" ON "server_offers" USING btree ("region");--> statement-breakpoint
CREATE INDEX "server_offers_lineType_idx" ON "server_offers" USING btree ("lineType");--> statement-breakpoint
CREATE INDEX "server_offers_priceAmount_idx" ON "server_offers" USING btree ("priceAmount");--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_providerId_aff_service_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."aff_service_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_sourcePostId_posts_id_fk" FOREIGN KEY ("sourcePostId") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
