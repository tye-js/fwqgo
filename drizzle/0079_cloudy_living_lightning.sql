ALTER TABLE "server_offers" ADD COLUMN "tier" varchar(40);--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "claudeSupport" varchar(40);--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "nativeIpType" varchar(40);--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "triNetwork" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "refundPolicy" text;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "renewPriceNative" text;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "panelNames" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "testIps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "cnPing" jsonb;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "geoPing" jsonb;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "externalSource" varchar(80);--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "externalVerifiedAt" timestamp;