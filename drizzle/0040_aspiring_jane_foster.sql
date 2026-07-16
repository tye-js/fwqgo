CREATE TABLE "provider_monitor_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"monitorId" integer NOT NULL,
	"status" varchar(24) DEFAULT 'running' NOT NULL,
	"httpStatus" integer,
	"responseHash" text,
	"received" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"pending" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"unchanged" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"missing" integer DEFAULT 0 NOT NULL,
	"errorTitle" text,
	"errorDetail" text,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"finishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_monitor_runs_status_check" CHECK ("provider_monitor_runs"."status" in ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "provider_offer_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"monitorId" integer NOT NULL,
	"providerId" integer NOT NULL,
	"externalProductId" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"sourceHash" text NOT NULL,
	"normalizedData" jsonb NOT NULL,
	"diff" jsonb,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"offerId" integer,
	"rejectionReason" text,
	"reviewedBy" text,
	"reviewedAt" timestamp,
	"firstSeenAt" timestamp DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "provider_offer_candidates_monitorId_externalProductId_unique" UNIQUE("monitorId","externalProductId"),
	CONSTRAINT "provider_offer_candidates_status_check" CHECK ("provider_offer_candidates"."status" in ('pending', 'accepted', 'rejected', 'superseded'))
);
--> statement-breakpoint
ALTER TABLE "provider_monitors" DROP CONSTRAINT "provider_monitors_adapter_check";--> statement-breakpoint
DROP INDEX "server_offer_sources_article_offerId_unique";--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD COLUMN "purpose" varchar(24) DEFAULT 'catalog' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD COLUMN "autoPublish" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD COLUMN "missingThreshold" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD COLUMN "lastModified" text;--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD COLUMN "responseHash" text;--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD COLUMN "lastSummary" jsonb;--> statement-breakpoint
ALTER TABLE "server_offer_sources" ADD COLUMN "relationType" varchar(24);--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "sourceMonitorId" integer;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "sourceHash" text;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "sourceLastSeenAt" timestamp;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "missingRuns" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "provider_monitors"
SET "purpose" = 'promotion'
WHERE "purpose" = 'catalog';--> statement-breakpoint
UPDATE "server_offer_sources"
SET "relationType" = 'mention'
WHERE "sourceType" = 'article' AND "relationType" IS NULL;--> statement-breakpoint
INSERT INTO "server_offer_sources" (
	"offerId",
	"sourceType",
	"sourcePostId",
	"sourceUrl",
	"relationType",
	"priority"
)
SELECT
	offer."id",
	'article',
	offer."sourcePostId",
	offer."articleUrl",
	'mention',
	10
FROM "server_offers" offer
WHERE offer."sourcePostId" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM "server_offer_sources" source
		WHERE source."offerId" = offer."id"
			AND source."sourceType" = 'article'
			AND source."sourcePostId" = offer."sourcePostId"
			AND source."relationType" = 'mention'
	);--> statement-breakpoint
UPDATE "server_offers" offer
SET
	"sourceMonitorId" = monitor."id",
	"sourceLastSeenAt" = COALESCE(offer."lastCheckedAt", offer."updatedAt", offer."createdAt"),
	"missingRuns" = 0
FROM "provider_monitors" monitor
WHERE offer."providerId" = monitor."providerId"
	AND EXISTS (
		SELECT 1
		FROM "server_offer_sources" source
		WHERE source."offerId" = offer."id"
			AND source."sourceType" IN ('monitor', 'provider')
			AND source."sourceUrl" = monitor."endpointUrl"
	);--> statement-breakpoint
UPDATE "server_offer_import_tasks"
SET
	"status" = 'cancelled',
	"progress" = 100,
	"message" = '文章套餐提取已停用，套餐数据源已迁移到供应商官网采集',
	"leaseOwner" = NULL,
	"leaseExpiresAt" = NULL,
	"heartbeatAt" = NULL,
	"finishedAt" = now(),
	"updatedAt" = now()
WHERE "status" IN ('pending', 'running');--> statement-breakpoint
UPDATE "admin_background_jobs"
SET
	"status" = 'cancelled',
	"lockedBy" = NULL,
	"lockedAt" = NULL,
	"heartbeatAt" = NULL,
	"lastError" = '文章套餐提取已停用，旧后台任务已归档',
	"finishedAt" = now(),
	"updatedAt" = now()
WHERE "jobKey" = 'server-offer-import-worker'
	AND "status" IN ('queued', 'running');--> statement-breakpoint
ALTER TABLE "provider_monitor_runs" ADD CONSTRAINT "provider_monitor_runs_monitorId_provider_monitors_id_fk" FOREIGN KEY ("monitorId") REFERENCES "public"."provider_monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_offer_candidates" ADD CONSTRAINT "provider_offer_candidates_monitorId_provider_monitors_id_fk" FOREIGN KEY ("monitorId") REFERENCES "public"."provider_monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_offer_candidates" ADD CONSTRAINT "provider_offer_candidates_providerId_aff_service_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."aff_service_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_offer_candidates" ADD CONSTRAINT "provider_offer_candidates_offerId_server_offers_id_fk" FOREIGN KEY ("offerId") REFERENCES "public"."server_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_offer_candidates" ADD CONSTRAINT "provider_offer_candidates_reviewedBy_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_monitor_runs_monitorId_idx" ON "provider_monitor_runs" USING btree ("monitorId");--> statement-breakpoint
CREATE INDEX "provider_monitor_runs_status_startedAt_idx" ON "provider_monitor_runs" USING btree ("status","startedAt");--> statement-breakpoint
CREATE INDEX "provider_monitor_runs_monitorId_startedAt_idx" ON "provider_monitor_runs" USING btree ("monitorId","startedAt");--> statement-breakpoint
CREATE INDEX "provider_offer_candidates_status_lastSeenAt_idx" ON "provider_offer_candidates" USING btree ("status","lastSeenAt");--> statement-breakpoint
CREATE INDEX "provider_offer_candidates_providerId_idx" ON "provider_offer_candidates" USING btree ("providerId");--> statement-breakpoint
CREATE INDEX "provider_offer_candidates_offerId_idx" ON "provider_offer_candidates" USING btree ("offerId");--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_sourceMonitorId_provider_monitors_id_fk" FOREIGN KEY ("sourceMonitorId") REFERENCES "public"."provider_monitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "server_offer_sources_article_relation_unique" ON "server_offer_sources" USING btree ("offerId","sourcePostId","relationType") WHERE "server_offer_sources"."sourceType" = 'article' and "server_offer_sources"."sourcePostId" is not null;--> statement-breakpoint
CREATE INDEX "server_offers_sourceMonitorId_idx" ON "server_offers" USING btree ("sourceMonitorId");--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD CONSTRAINT "provider_monitors_purpose_check" CHECK ("provider_monitors"."purpose" in ('catalog', 'promotion', 'stock'));--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD CONSTRAINT "provider_monitors_missingThreshold_check" CHECK ("provider_monitors"."missingThreshold" between 1 and 20);--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD CONSTRAINT "provider_monitors_adapter_check" CHECK ("provider_monitors"."adapter" in ('json', 'html', 'whmcs'));--> statement-breakpoint
ALTER TABLE "server_offer_sources" ADD CONSTRAINT "server_offer_sources_relationType_check" CHECK ("server_offer_sources"."relationType" is null or "server_offer_sources"."relationType" in ('review', 'mention', 'deal'));--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_missingRuns_check" CHECK ("server_offers"."missingRuns" >= 0);
