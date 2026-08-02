UPDATE "knowledge_article_modules" SET "moduleType" = 'network_experience' WHERE "moduleType" = 'network_line_selector';--> statement-breakpoint
ALTER TABLE "knowledge_article_modules" DROP CONSTRAINT IF EXISTS "knowledge_article_modules_moduleType_check";--> statement-breakpoint
ALTER TABLE "knowledge_article_modules" ADD CONSTRAINT "knowledge_article_modules_moduleType_check" CHECK ("knowledge_article_modules"."moduleType" in ('network_experience', 'server_sizing'));--> statement-breakpoint
INSERT INTO "server_network_lines" ("slug", "name", "enName", "aliases") VALUES
  ('cuii', 'CUII', 'CUII', 'CUII,联通国际优化'),
  ('cmin2', 'CMIN2', 'CMIN2', 'CMIN2,移动国际优化')
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
CREATE TABLE "network_experience_rule_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"versionLabel" varchar(80) NOT NULL,
	"engineVersion" varchar(120) NOT NULL,
	"schemaVersion" integer NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"snapshotJson" jsonb NOT NULL,
	"checksum" varchar(128) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"changeSummary" text,
	"enChangeSummary" text,
	"reviewDueAt" timestamp,
	"validUntil" timestamp,
	"createdBy" text,
	"reviewedBy" text,
	"publishedBy" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"reviewedAt" timestamp,
	"publishedAt" timestamp,
	"retiredAt" timestamp,
	CONSTRAINT "network_experience_rule_sets_versionLabel_unique" UNIQUE("versionLabel"),
	CONSTRAINT "network_experience_rule_sets_status_check" CHECK ("network_experience_rule_sets"."status" in ('draft', 'published', 'retired')),
	CONSTRAINT "network_experience_rule_sets_schemaVersion_check" CHECK ("network_experience_rule_sets"."schemaVersion" >= 1),
	CONSTRAINT "network_experience_rule_sets_revision_check" CHECK ("network_experience_rule_sets"."revision" >= 1)
);--> statement-breakpoint
CREATE TABLE "network_experience_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"ruleSetId" integer NOT NULL,
	"ruleKey" varchar(160) NOT NULL,
	"networkLineId" integer NOT NULL,
	"userRegion" varchar(40) NOT NULL,
	"carrier" varchar(16) NOT NULL,
	"accessType" varchar(20) NOT NULL,
	"destinationRegion" varchar(24) NOT NULL,
	"workload" varchar(20) NOT NULL,
	"fit" varchar(32) NOT NULL,
	"basisStrength" varchar(16) NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"conditionCodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"advantageCodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"riskCodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verificationCodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "network_experience_rules_ruleSetId_ruleKey_unique" UNIQUE("ruleSetId","ruleKey"),
	CONSTRAINT "network_experience_rules_carrier_check" CHECK ("network_experience_rules"."carrier" in ('telecom', 'unicom', 'mobile')),
	CONSTRAINT "network_experience_rules_fit_check" CHECK ("network_experience_rules"."fit" in ('usually_preferred', 'situational', 'usually_not_preferred', 'unknown')),
	CONSTRAINT "network_experience_rules_basisStrength_check" CHECK ("network_experience_rules"."basisStrength" in ('established', 'common', 'limited')),
	CONSTRAINT "network_experience_rules_priority_check" CHECK ("network_experience_rules"."priority" between -100000 and 100000)
);--> statement-breakpoint
CREATE TABLE "network_experience_rule_sources" (
	"ruleId" integer NOT NULL,
	"sourceRevisionId" integer NOT NULL,
	"claimScope" text NOT NULL,
	"experienceAuthor" text NOT NULL,
	"experienceReviewedBy" text,
	"experienceReviewedAt" timestamp,
	"notes" text,
	CONSTRAINT "network_experience_rule_sources_ruleId_sourceRevisionId_pk" PRIMARY KEY("ruleId","sourceRevisionId")
);--> statement-breakpoint
CREATE TABLE "network_experience_rule_articles" (
	"ruleId" integer NOT NULL,
	"sourceArticleId" integer NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "network_experience_rule_articles_ruleId_sourceArticleId_pk" PRIMARY KEY("ruleId","sourceArticleId")
);--> statement-breakpoint
ALTER TABLE "network_experience_rule_sets" ADD CONSTRAINT "network_experience_rule_sets_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_experience_rule_sets" ADD CONSTRAINT "network_experience_rule_sets_reviewedBy_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_experience_rule_sets" ADD CONSTRAINT "network_experience_rule_sets_publishedBy_users_id_fk" FOREIGN KEY ("publishedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_experience_rules" ADD CONSTRAINT "network_experience_rules_ruleSetId_network_experience_rule_sets_id_fk" FOREIGN KEY ("ruleSetId") REFERENCES "public"."network_experience_rule_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_experience_rules" ADD CONSTRAINT "network_experience_rules_networkLineId_server_network_lines_id_fk" FOREIGN KEY ("networkLineId") REFERENCES "public"."server_network_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_experience_rule_sources" ADD CONSTRAINT "network_experience_rule_sources_ruleId_network_experience_rules_id_fk" FOREIGN KEY ("ruleId") REFERENCES "public"."network_experience_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_experience_rule_sources" ADD CONSTRAINT "network_experience_rule_sources_sourceRevisionId_knowledge_source_revisions_id_fk" FOREIGN KEY ("sourceRevisionId") REFERENCES "public"."knowledge_source_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_experience_rule_articles" ADD CONSTRAINT "network_experience_rule_articles_ruleId_network_experience_rules_id_fk" FOREIGN KEY ("ruleId") REFERENCES "public"."network_experience_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_experience_rule_articles" ADD CONSTRAINT "network_experience_rule_articles_sourceArticleId_knowledge_articles_id_fk" FOREIGN KEY ("sourceArticleId") REFERENCES "public"."knowledge_articles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "network_experience_rule_sets_published_unique" ON "network_experience_rule_sets" USING btree ("status") WHERE "network_experience_rule_sets"."status" = 'published';--> statement-breakpoint
CREATE INDEX "network_experience_rule_sets_status_createdAt_idx" ON "network_experience_rule_sets" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "network_experience_rules_ruleSetId_idx" ON "network_experience_rules" USING btree ("ruleSetId","sortOrder");--> statement-breakpoint
CREATE INDEX "network_experience_rules_networkLineId_idx" ON "network_experience_rules" USING btree ("networkLineId");--> statement-breakpoint
CREATE INDEX "network_experience_rule_articles_ruleId_idx" ON "network_experience_rule_articles" USING btree ("ruleId","sortOrder");
