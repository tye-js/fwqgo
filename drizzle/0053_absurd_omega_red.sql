CREATE TABLE "provider_catalog_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"providerId" integer NOT NULL,
	"aiConfigId" integer,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"currentStep" varchar(40) DEFAULT 'queued' NOT NULL,
	"prompt" text,
	"aiResponse" text,
	"discoveredUrls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sourceMappings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sourceCount" integer DEFAULT 0 NOT NULL,
	"monitorCount" integer DEFAULT 0 NOT NULL,
	"candidateCount" integer DEFAULT 0 NOT NULL,
	"error" text,
	"requestedBy" text,
	"startedAt" timestamp,
	"finishedAt" timestamp,
	"capturedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "provider_catalog_scans_status_check" CHECK ("provider_catalog_scans"."status" in ('queued', 'running', 'succeeded', 'partial', 'needs_auth', 'failed', 'cancelled')),
	CONSTRAINT "provider_catalog_scans_progress_check" CHECK ("provider_catalog_scans"."progress" between 0 and 100),
	CONSTRAINT "provider_catalog_scans_counters_check" CHECK (least("provider_catalog_scans"."sourceCount", "provider_catalog_scans"."monitorCount", "provider_catalog_scans"."candidateCount") >= 0),
	CONSTRAINT "provider_catalog_scans_arrays_check" CHECK (jsonb_typeof("provider_catalog_scans"."discoveredUrls") = 'array'
        and jsonb_typeof("provider_catalog_scans"."sourceMappings") = 'array'
        and jsonb_typeof("provider_catalog_scans"."warnings") = 'array')
);
--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" ADD COLUMN "providerCatalogDiscoveryPrompt" text;--> statement-breakpoint
ALTER TABLE "provider_monitor_runs" ADD COLUMN "scanId" integer;--> statement-breakpoint
ALTER TABLE "provider_monitor_runs" ADD COLUMN "runMode" varchar(24) DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD COLUMN "scheduleMode" varchar(24) DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD COLUMN "discoveredByScanId" integer;--> statement-breakpoint
ALTER TABLE "provider_offer_candidates" ADD COLUMN "scanId" integer;--> statement-breakpoint
ALTER TABLE "provider_catalog_scans" ADD CONSTRAINT "provider_catalog_scans_providerId_aff_service_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."aff_service_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_catalog_scans" ADD CONSTRAINT "provider_catalog_scans_aiConfigId_ai_rewrite_configs_id_fk" FOREIGN KEY ("aiConfigId") REFERENCES "public"."ai_rewrite_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_catalog_scans" ADD CONSTRAINT "provider_catalog_scans_requestedBy_users_id_fk" FOREIGN KEY ("requestedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_catalog_scans_providerId_createdAt_idx" ON "provider_catalog_scans" USING btree ("providerId","createdAt");--> statement-breakpoint
CREATE INDEX "provider_catalog_scans_status_createdAt_idx" ON "provider_catalog_scans" USING btree ("status","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_catalog_scans_providerId_open_unique" ON "provider_catalog_scans" USING btree ("providerId") WHERE "provider_catalog_scans"."status" in ('queued', 'running');--> statement-breakpoint
ALTER TABLE "provider_monitor_runs" ADD CONSTRAINT "provider_monitor_runs_scanId_provider_catalog_scans_id_fk" FOREIGN KEY ("scanId") REFERENCES "public"."provider_catalog_scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD CONSTRAINT "provider_monitors_discoveredByScanId_provider_catalog_scans_id_fk" FOREIGN KEY ("discoveredByScanId") REFERENCES "public"."provider_catalog_scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_offer_candidates" ADD CONSTRAINT "provider_offer_candidates_scanId_provider_catalog_scans_id_fk" FOREIGN KEY ("scanId") REFERENCES "public"."provider_catalog_scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_monitor_runs_scanId_idx" ON "provider_monitor_runs" USING btree ("scanId");--> statement-breakpoint
CREATE INDEX "provider_monitors_discoveredByScanId_idx" ON "provider_monitors" USING btree ("discoveredByScanId");--> statement-breakpoint
CREATE INDEX "provider_offer_candidates_scanId_idx" ON "provider_offer_candidates" USING btree ("scanId");--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD CONSTRAINT "provider_monitors_scan_source_unique" UNIQUE("discoveredByScanId","endpointUrl","adapter");--> statement-breakpoint
ALTER TABLE "provider_monitor_runs" ADD CONSTRAINT "provider_monitor_runs_runMode_check" CHECK ("provider_monitor_runs"."runMode" in ('scheduled', 'once'));--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD CONSTRAINT "provider_monitors_scheduleMode_check" CHECK ("provider_monitors"."scheduleMode" in ('scheduled', 'once'));