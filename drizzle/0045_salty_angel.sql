CREATE TABLE "provider_profile_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"providerId" integer NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"summary" text,
	"summarySourceUrl" text,
	"refundPolicy" text,
	"refundPolicySourceUrl" text,
	"prohibitedUses" text,
	"prohibitedUsesSourceUrl" text,
	"discoveredUrls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"requestedBy" text,
	"reviewedBy" text,
	"fetchedAt" timestamp,
	"reviewedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "provider_profile_snapshots_status_check" CHECK ("provider_profile_snapshots"."status" in ('queued', 'running', 'pending', 'applied', 'rejected', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "provider_promo_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"providerId" integer NOT NULL,
	"code" varchar(160) NOT NULL,
	"description" text,
	"discountText" varchar(500),
	"terms" text,
	"startsAt" timestamp,
	"endsAt" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"sourceUrl" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "provider_promo_codes_date_range_check" CHECK ("provider_promo_codes"."startsAt" is null or "provider_promo_codes"."endsAt" is null or "provider_promo_codes"."endsAt" >= "provider_promo_codes"."startsAt"),
	CONSTRAINT "provider_promo_codes_default_active_check" CHECK ("provider_promo_codes"."isDefault" = false or "provider_promo_codes"."active" = true)
);
--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "summarySourceUrl" text;--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "refundPolicy" text;--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "refundPolicySourceUrl" text;--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "prohibitedUses" text;--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "prohibitedUsesSourceUrl" text;--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "profileVerifiedAt" timestamp;--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "profileUpdatedAt" timestamp;--> statement-breakpoint
ALTER TABLE "provider_profile_snapshots" ADD CONSTRAINT "provider_profile_snapshots_providerId_aff_service_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."aff_service_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_profile_snapshots" ADD CONSTRAINT "provider_profile_snapshots_requestedBy_users_id_fk" FOREIGN KEY ("requestedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_profile_snapshots" ADD CONSTRAINT "provider_profile_snapshots_reviewedBy_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_promo_codes" ADD CONSTRAINT "provider_promo_codes_providerId_aff_service_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."aff_service_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_profile_snapshots_providerId_status_createdAt_idx" ON "provider_profile_snapshots" USING btree ("providerId","status","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_profile_snapshots_providerId_open_unique" ON "provider_profile_snapshots" USING btree ("providerId") WHERE "provider_profile_snapshots"."status" in ('queued', 'running', 'pending');--> statement-breakpoint
CREATE INDEX "provider_profile_snapshots_status_createdAt_idx" ON "provider_profile_snapshots" USING btree ("status","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_promo_codes_providerId_code_unique" ON "provider_promo_codes" USING btree ("providerId",lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "provider_promo_codes_providerId_default_unique" ON "provider_promo_codes" USING btree ("providerId") WHERE "provider_promo_codes"."isDefault" = true;--> statement-breakpoint
CREATE INDEX "provider_promo_codes_providerId_active_endsAt_idx" ON "provider_promo_codes" USING btree ("providerId","active","endsAt");