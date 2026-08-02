CREATE TABLE "knowledge_article_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceArticleId" integer NOT NULL,
	"moduleType" varchar(40) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "knowledge_article_modules_source_module_unique" UNIQUE("sourceArticleId","moduleType"),
	CONSTRAINT "knowledge_article_modules_moduleType_check" CHECK ("knowledge_article_modules"."moduleType" in ('network_line_selector', 'server_sizing'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_article_sources" (
	"articleId" integer NOT NULL,
	"sourceRevisionId" integer NOT NULL,
	"citationKey" varchar(80) NOT NULL,
	"claimScope" text NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_article_sources_articleId_sourceRevisionId_pk" PRIMARY KEY("articleId","sourceRevisionId"),
	CONSTRAINT "knowledge_article_sources_article_citation_unique" UNIQUE("articleId","citationKey"),
	CONSTRAINT "knowledge_article_sources_claimScope_check" CHECK (length(trim("knowledge_article_sources"."claimScope")) > 0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_article_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"articleId" integer NOT NULL,
	"contentRevision" integer NOT NULL,
	"documentJson" jsonb NOT NULL,
	"sourceSetJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sourceSetHash" varchar(128) NOT NULL,
	"reason" text,
	"createdBy" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_article_versions_article_revision_unique" UNIQUE("articleId","contentRevision"),
	CONSTRAINT "knowledge_article_versions_revision_check" CHECK ("knowledge_article_versions"."contentRevision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "knowledge_source_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceId" integer NOT NULL,
	"revision" integer NOT NULL,
	"publisher" text NOT NULL,
	"title" text NOT NULL,
	"canonicalUrl" text NOT NULL,
	"publishedAt" timestamp,
	"retrievedAt" timestamp DEFAULT now() NOT NULL,
	"contentHash" varchar(128) NOT NULL,
	"changeReason" text,
	"createdBy" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_source_revisions_source_revision_unique" UNIQUE("sourceId","revision"),
	CONSTRAINT "knowledge_source_revisions_revision_check" CHECK ("knowledge_source_revisions"."revision" >= 1),
	CONSTRAINT "knowledge_source_revisions_url_check" CHECK (length(trim("knowledge_source_revisions"."canonicalUrl")) > 0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceKey" varchar(180) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"authorityTier" varchar(1) NOT NULL,
	"currentRevisionId" integer,
	"reviewDueAt" timestamp,
	"validUntil" timestamp,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "knowledge_sources_sourceKey_unique" UNIQUE("sourceKey"),
	CONSTRAINT "knowledge_sources_authorityTier_check" CHECK ("knowledge_sources"."authorityTier" in ('A', 'B', 'C')),
	CONSTRAINT "knowledge_sources_status_check" CHECK ("knowledge_sources"."status" in ('active', 'superseded', 'broken', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "network_assessment_heads" (
	"candidateId" integer NOT NULL,
	"audienceProfileKey" varchar(240) NOT NULL,
	"snapshotId" bigint,
	"headRevision" integer DEFAULT 1 NOT NULL,
	"updatedBy" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_assessment_heads_candidateId_audienceProfileKey_pk" PRIMARY KEY("candidateId","audienceProfileKey"),
	CONSTRAINT "network_assessment_heads_headRevision_check" CHECK ("network_assessment_heads"."headRevision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "network_assessment_input_rollups" (
	"snapshotId" bigint NOT NULL,
	"rollupId" bigint NOT NULL,
	"cellKey" varchar(240) NOT NULL,
	"role" varchar(40) NOT NULL,
	"weightBps" integer NOT NULL,
	CONSTRAINT "network_assessment_input_rollups_snapshotId_rollupId_pk" PRIMARY KEY("snapshotId","rollupId"),
	CONSTRAINT "network_assessment_input_rollups_weightBps_check" CHECK ("network_assessment_input_rollups"."weightBps" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "network_assessment_publication_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"candidateId" integer NOT NULL,
	"audienceProfileKey" varchar(240) NOT NULL,
	"snapshotId" bigint,
	"eventType" varchar(32) NOT NULL,
	"idempotencyKey" varchar(160) NOT NULL,
	"reason" text,
	"actorId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_assessment_publication_events_idempotencyKey_unique" UNIQUE("idempotencyKey"),
	CONSTRAINT "network_assessment_publication_events_eventType_check" CHECK ("network_assessment_publication_events"."eventType" in ('published', 'withdrawn', 'rollback_published', 'expired_observed', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "network_assessment_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"candidateId" integer NOT NULL,
	"audienceProfileKey" varchar(240) NOT NULL,
	"candidateRevisionId" integer NOT NULL,
	"targetSetHash" varchar(128) NOT NULL,
	"routeStateSnapshotId" bigint,
	"measurementProtocolVersion" varchar(80) NOT NULL,
	"parserVersion" varchar(80) NOT NULL,
	"rollupSchemaVersion" integer NOT NULL,
	"formulaVersion" varchar(80) NOT NULL,
	"policyChecksum" varchar(128) NOT NULL,
	"inputManifestJson" jsonb NOT NULL,
	"inputManifestHash" varchar(128) NOT NULL,
	"observedFrom" timestamp NOT NULL,
	"observedTo" timestamp NOT NULL,
	"validUntil" timestamp,
	"operatorAssessments" jsonb NOT NULL,
	"reasonCodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"riskCodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_assessment_snapshots_observed_window_check" CHECK ("network_assessment_snapshots"."observedTo" > "network_assessment_snapshots"."observedFrom")
);
--> statement-breakpoint
CREATE TABLE "network_assessment_sources" (
	"snapshotId" bigint NOT NULL,
	"sourceRevisionId" integer NOT NULL,
	"claimScope" text NOT NULL,
	"evidenceRole" varchar(40) NOT NULL,
	CONSTRAINT "network_assessment_sources_snapshotId_sourceRevisionId_pk" PRIMARY KEY("snapshotId","sourceRevisionId")
);
--> statement-breakpoint
CREATE TABLE "network_line_candidate_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidateId" integer NOT NULL,
	"revision" integer NOT NULL,
	"regionCode" varchar(40) NOT NULL,
	"datacenter" text NOT NULL,
	"productRef" text NOT NULL,
	"declaredLabels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"configurationJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"configurationHash" varchar(128) NOT NULL,
	"createdBy" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_line_candidate_revisions_candidate_revision_unique" UNIQUE("candidateId","revision"),
	CONSTRAINT "network_line_candidate_revisions_candidate_hash_unique" UNIQUE("candidateId","configurationHash"),
	CONSTRAINT "network_line_candidate_revisions_revision_check" CHECK ("network_line_candidate_revisions"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "network_line_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(160) NOT NULL,
	"name" text NOT NULL,
	"enName" text,
	"providerId" integer,
	"currentConfigurationRevisionId" integer,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"archivedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "network_line_candidates_slug_unique" UNIQUE("slug"),
	CONSTRAINT "network_line_candidates_status_check" CHECK ("network_line_candidates"."status" in ('draft', 'active', 'withdrawn', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "network_measurement_campaign_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaignId" integer NOT NULL,
	"revision" integer NOT NULL,
	"probeSelector" jsonb NOT NULL,
	"metricProfile" jsonb NOT NULL,
	"protocolVersion" varchar(80) NOT NULL,
	"intervalMinutes" integer NOT NULL,
	"peakWindows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"startsAt" timestamp,
	"endsAt" timestamp,
	"configurationJson" jsonb NOT NULL,
	"configurationHash" varchar(128) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_measurement_campaign_revisions_campaign_revision_unique" UNIQUE("campaignId","revision"),
	CONSTRAINT "network_measurement_campaign_revisions_campaign_hash_unique" UNIQUE("campaignId","configurationHash"),
	CONSTRAINT "network_measurement_campaign_revisions_intervalMinutes_check" CHECK ("network_measurement_campaign_revisions"."intervalMinutes" between 1 and 10080),
	CONSTRAINT "network_measurement_campaign_revisions_revision_check" CHECK ("network_measurement_campaign_revisions"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "network_measurement_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidateId" integer NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"currentConfigurationRevisionId" integer,
	"runGeneration" integer DEFAULT 1 NOT NULL,
	"nextRunAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "network_measurement_campaigns_status_check" CHECK ("network_measurement_campaigns"."status" in ('draft', 'active', 'paused', 'retired')),
	CONSTRAINT "network_measurement_campaigns_runGeneration_check" CHECK ("network_measurement_campaigns"."runGeneration" >= 1)
);
--> statement-breakpoint
CREATE TABLE "network_measurement_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"probeId" integer,
	"targetAgentId" integer,
	"keyId" varchar(120) NOT NULL,
	"secretCiphertext" text NOT NULL,
	"activatedAt" timestamp NOT NULL,
	"expiresAt" timestamp,
	"revokedAt" timestamp,
	"rotationOfId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_measurement_credentials_keyId_unique" UNIQUE("keyId"),
	CONSTRAINT "network_measurement_credentials_owner_check" CHECK (("network_measurement_credentials"."probeId" is not null and "network_measurement_credentials"."targetAgentId" is null) or ("network_measurement_credentials"."probeId" is null and "network_measurement_credentials"."targetAgentId" is not null)),
	CONSTRAINT "network_measurement_credentials_expiry_check" CHECK ("network_measurement_credentials"."expiresAt" is null or "network_measurement_credentials"."expiresAt" > "network_measurement_credentials"."activatedAt")
);
--> statement-breakpoint
CREATE TABLE "network_measurement_ingest_nonces" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"credentialId" integer NOT NULL,
	"nonce" varchar(64) NOT NULL,
	"requestTimestamp" timestamp NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_measurement_ingest_nonces_credential_nonce_unique" UNIQUE("credentialId","nonce")
);
--> statement-breakpoint
CREATE TABLE "network_measurement_probe_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"probeId" integer NOT NULL,
	"revision" integer NOT NULL,
	"countryCode" varchar(16),
	"regionCode" varchar(40) NOT NULL,
	"carrier" varchar(16) NOT NULL,
	"accessType" varchar(24) NOT NULL,
	"asn" bigint,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trustLevel" varchar(8) NOT NULL,
	"ownerOrgKey" varchar(120) NOT NULL,
	"accessPrefixKey" varchar(160) NOT NULL,
	"physicalSiteKey" varchar(160) NOT NULL,
	"independenceKey" varchar(160) NOT NULL,
	"configurationHash" varchar(128) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_measurement_probe_revisions_probe_revision_unique" UNIQUE("probeId","revision"),
	CONSTRAINT "network_measurement_probe_revisions_probe_hash_unique" UNIQUE("probeId","configurationHash"),
	CONSTRAINT "network_measurement_probe_revisions_carrier_check" CHECK ("network_measurement_probe_revisions"."carrier" in ('telecom', 'unicom', 'mobile', 'other')),
	CONSTRAINT "network_measurement_probe_revisions_accessType_check" CHECK ("network_measurement_probe_revisions"."accessType" in ('residential', 'business', 'mobile', 'unknown')),
	CONSTRAINT "network_measurement_probe_revisions_revision_check" CHECK ("network_measurement_probe_revisions"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "network_measurement_probes" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceKind" varchar(24) NOT NULL,
	"externalId" varchar(160) NOT NULL,
	"currentConfigurationRevisionId" integer,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"lastSeenAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_measurement_probes_source_external_unique" UNIQUE("sourceKind","externalId"),
	CONSTRAINT "network_measurement_probes_status_check" CHECK ("network_measurement_probes"."status" in ('active', 'stale', 'revoked', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "network_measurement_raw_batches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"runId" bigint NOT NULL,
	"sourceKind" varchar(24) NOT NULL,
	"credentialId" integer,
	"batchId" varchar(160) NOT NULL,
	"bodyHash" varchar(128) NOT NULL,
	"payload" jsonb NOT NULL,
	"receivedAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL,
	CONSTRAINT "network_measurement_raw_batches_source_batch_unique" UNIQUE("sourceKind","batchId"),
	CONSTRAINT "network_measurement_raw_batches_credential_batch_unique" UNIQUE("credentialId","batchId")
);
--> statement-breakpoint
CREATE TABLE "network_measurement_rollups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"candidateId" integer NOT NULL,
	"targetRevisionId" integer,
	"probeRevisionId" integer,
	"campaignRevisionId" integer,
	"windowKind" varchar(16) NOT NULL,
	"windowStart" timestamp NOT NULL,
	"windowEnd" timestamp NOT NULL,
	"dimensionJson" jsonb NOT NULL,
	"sampleCount" integer NOT NULL,
	"probeCount" integer NOT NULL,
	"distributionJson" jsonb NOT NULL,
	"percentileJson" jsonb NOT NULL,
	"rollupSchemaVersion" integer NOT NULL,
	"inputHash" varchar(128) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_measurement_rollups_input_unique" UNIQUE("inputHash"),
	CONSTRAINT "network_measurement_rollups_window_check" CHECK ("network_measurement_rollups"."windowEnd" > "network_measurement_rollups"."windowStart" and "network_measurement_rollups"."sampleCount" >= 0 and "network_measurement_rollups"."probeCount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "network_measurement_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaignId" integer NOT NULL,
	"campaignRevisionId" integer NOT NULL,
	"slotAt" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"externalMeasurementId" text,
	"runGeneration" integer NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"coverageBps" integer DEFAULT 0 NOT NULL,
	"errorDetail" text,
	"startedAt" timestamp,
	"finishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_measurement_runs_schedule_unique" UNIQUE("campaignId","slotAt","campaignRevisionId","runGeneration"),
	CONSTRAINT "network_measurement_runs_status_check" CHECK ("network_measurement_runs"."status" in ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'stale')),
	CONSTRAINT "network_measurement_runs_coverageBps_check" CHECK ("network_measurement_runs"."coverageBps" between 0 and 10000),
	CONSTRAINT "network_measurement_runs_runGeneration_check" CHECK ("network_measurement_runs"."runGeneration" >= 1)
);
--> statement-breakpoint
CREATE TABLE "network_measurement_samples" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"runId" bigint NOT NULL,
	"rawBatchId" bigint,
	"probeRevisionId" integer NOT NULL,
	"targetRevisionId" integer NOT NULL,
	"direction" varchar(12) NOT NULL,
	"protocol" varchar(16) NOT NULL,
	"observedAt" timestamp NOT NULL,
	"rttMs" integer,
	"jitterMs" integer,
	"packetLossBps" integer,
	"throughputKbps" integer,
	"ttfbMs" integer,
	"pathHash" varchar(128),
	"qualityFlags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parserVersion" varchar(80) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_measurement_samples_direction_check" CHECK ("network_measurement_samples"."direction" in ('forward', 'reverse')),
	CONSTRAINT "network_measurement_samples_metric_check" CHECK (("network_measurement_samples"."rttMs" is null or "network_measurement_samples"."rttMs" >= 0)
        and ("network_measurement_samples"."jitterMs" is null or "network_measurement_samples"."jitterMs" >= 0)
        and ("network_measurement_samples"."packetLossBps" is null or "network_measurement_samples"."packetLossBps" between 0 and 10000)
        and ("network_measurement_samples"."throughputKbps" is null or "network_measurement_samples"."throughputKbps" >= 0)
        and ("network_measurement_samples"."ttfbMs" is null or "network_measurement_samples"."ttfbMs" >= 0))
);
--> statement-breakpoint
CREATE TABLE "network_measurement_target_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"targetId" integer NOT NULL,
	"revision" integer NOT NULL,
	"targetAgentRevisionId" integer,
	"addressFamily" varchar(8) NOT NULL,
	"targetAddress" text NOT NULL,
	"targetPrefix" text NOT NULL,
	"originAsn" bigint,
	"port" integer,
	"configurationHash" varchar(128) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_measurement_target_revisions_target_revision_unique" UNIQUE("targetId","revision"),
	CONSTRAINT "network_measurement_target_revisions_target_address_port_unique" UNIQUE("targetId","addressFamily","targetAddress","port"),
	CONSTRAINT "network_measurement_target_revisions_addressFamily_check" CHECK ("network_measurement_target_revisions"."addressFamily" in ('ipv4', 'ipv6')),
	CONSTRAINT "network_measurement_target_revisions_port_check" CHECK ("network_measurement_target_revisions"."port" is null or "network_measurement_target_revisions"."port" between 1 and 65535),
	CONSTRAINT "network_measurement_target_revisions_revision_check" CHECK ("network_measurement_target_revisions"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "network_measurement_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidateId" integer NOT NULL,
	"currentConfigurationRevisionId" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_route_observations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"targetRevisionId" integer NOT NULL,
	"collector" varchar(80) NOT NULL,
	"vantageKey" varchar(160) NOT NULL,
	"prefix" text NOT NULL,
	"originAsn" bigint,
	"asPath" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"eventType" varchar(24) NOT NULL,
	"observedAt" timestamp NOT NULL,
	"pathHash" varchar(128) NOT NULL,
	"parserVersion" varchar(80) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_route_observations_material_unique" UNIQUE("targetRevisionId","collector","vantageKey","prefix","observedAt"),
	CONSTRAINT "network_route_observations_eventType_check" CHECK ("network_route_observations"."eventType" in ('snapshot', 'announcement', 'withdrawal', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "network_route_state_heads" (
	"candidateId" integer NOT NULL,
	"addressFamily" varchar(8) NOT NULL,
	"routeStateSnapshotId" bigint,
	"headRevision" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_route_state_heads_candidateId_addressFamily_pk" PRIMARY KEY("candidateId","addressFamily"),
	CONSTRAINT "network_route_state_heads_snapshot_unique" UNIQUE("routeStateSnapshotId"),
	CONSTRAINT "network_route_state_heads_addressFamily_check" CHECK ("network_route_state_heads"."addressFamily" in ('ipv4', 'ipv6')),
	CONSTRAINT "network_route_state_heads_headRevision_check" CHECK ("network_route_state_heads"."headRevision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "network_route_state_inputs" (
	"routeStateSnapshotId" bigint NOT NULL,
	"routeObservationId" bigint NOT NULL,
	"evidenceRole" varchar(40) NOT NULL,
	CONSTRAINT "network_route_state_inputs_routeStateSnapshotId_routeObservationId_pk" PRIMARY KEY("routeStateSnapshotId","routeObservationId")
);
--> statement-breakpoint
CREATE TABLE "network_route_state_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"candidateRevisionId" integer NOT NULL,
	"addressFamily" varchar(8) NOT NULL,
	"targetSetHash" varchar(128) NOT NULL,
	"routeStatePolicyVersion" varchar(80) NOT NULL,
	"materialRouteStateHash" varchar(128) NOT NULL,
	"inputManifestJson" jsonb NOT NULL,
	"inputManifestHash" varchar(128) NOT NULL,
	"observedFrom" timestamp NOT NULL,
	"observedTo" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_route_state_snapshots_material_unique" UNIQUE("candidateRevisionId","addressFamily","materialRouteStateHash","routeStatePolicyVersion"),
	CONSTRAINT "network_route_state_snapshots_addressFamily_check" CHECK ("network_route_state_snapshots"."addressFamily" in ('ipv4', 'ipv6')),
	CONSTRAINT "network_route_state_snapshots_observed_window_check" CHECK ("network_route_state_snapshots"."observedTo" > "network_route_state_snapshots"."observedFrom")
);
--> statement-breakpoint
CREATE TABLE "network_target_agent_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"targetAgentId" integer NOT NULL,
	"revision" integer NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"configurationHash" varchar(128) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_target_agent_revisions_agent_revision_unique" UNIQUE("targetAgentId","revision"),
	CONSTRAINT "network_target_agent_revisions_agent_hash_unique" UNIQUE("targetAgentId","configurationHash"),
	CONSTRAINT "network_target_agent_revisions_revision_check" CHECK ("network_target_agent_revisions"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "network_target_agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidateId" integer NOT NULL,
	"externalId" varchar(160) NOT NULL,
	"currentConfigurationRevisionId" integer,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"lastSeenAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "network_target_agents_candidate_external_unique" UNIQUE("candidateId","externalId"),
	CONSTRAINT "network_target_agents_status_check" CHECK ("network_target_agents"."status" in ('active', 'revoked', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "network_target_prefix_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"targetRevisionId" integer NOT NULL,
	"deliveryPrefixHash" varchar(128) NOT NULL,
	"verificationMethod" varchar(80) NOT NULL,
	"evidenceRef" text,
	"verifiedBy" text,
	"verifiedAt" timestamp NOT NULL,
	"validUntil" timestamp,
	"invalidatedAt" timestamp,
	CONSTRAINT "network_target_prefix_verifications_target_revision_prefix_unique" UNIQUE("targetRevisionId","deliveryPrefixHash")
);
--> statement-breakpoint
CREATE TABLE "server_sizing_rule_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"versionLabel" varchar(80) NOT NULL,
	"engineVersion" varchar(120) NOT NULL,
	"schemaVersion" integer NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"config" jsonb NOT NULL,
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
	CONSTRAINT "server_sizing_rule_sets_versionLabel_unique" UNIQUE("versionLabel"),
	CONSTRAINT "server_sizing_rule_sets_status_check" CHECK ("server_sizing_rule_sets"."status" in ('draft', 'published', 'retired')),
	CONSTRAINT "server_sizing_rule_sets_schemaVersion_check" CHECK ("server_sizing_rule_sets"."schemaVersion" >= 1),
	CONSTRAINT "server_sizing_rule_sets_revision_check" CHECK ("server_sizing_rule_sets"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "server_sizing_rule_sources" (
	"ruleSetId" integer NOT NULL,
	"sourceRevisionId" integer NOT NULL,
	"claimScope" text NOT NULL,
	"enClaimScope" text,
	"reviewDueAt" timestamp,
	CONSTRAINT "server_sizing_rule_sources_ruleSetId_sourceRevisionId_pk" PRIMARY KEY("ruleSetId","sourceRevisionId")
);
--> statement-breakpoint
ALTER TABLE "knowledge_article_modules" ADD CONSTRAINT "knowledge_article_modules_sourceArticleId_knowledge_articles_id_fk" FOREIGN KEY ("sourceArticleId") REFERENCES "public"."knowledge_articles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_article_sources" ADD CONSTRAINT "knowledge_article_sources_articleId_knowledge_articles_id_fk" FOREIGN KEY ("articleId") REFERENCES "public"."knowledge_articles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_article_sources" ADD CONSTRAINT "knowledge_article_sources_sourceRevisionId_knowledge_source_revisions_id_fk" FOREIGN KEY ("sourceRevisionId") REFERENCES "public"."knowledge_source_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_article_versions" ADD CONSTRAINT "knowledge_article_versions_articleId_knowledge_articles_id_fk" FOREIGN KEY ("articleId") REFERENCES "public"."knowledge_articles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_article_versions" ADD CONSTRAINT "knowledge_article_versions_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_revisions" ADD CONSTRAINT "knowledge_source_revisions_sourceId_knowledge_sources_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."knowledge_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_revisions" ADD CONSTRAINT "knowledge_source_revisions_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_assessment_heads" ADD CONSTRAINT "network_assessment_heads_candidateId_network_line_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."network_line_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_assessment_heads" ADD CONSTRAINT "network_assessment_heads_snapshotId_network_assessment_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."network_assessment_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_assessment_heads" ADD CONSTRAINT "network_assessment_heads_updatedBy_users_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_assessment_input_rollups" ADD CONSTRAINT "network_assessment_input_rollups_snapshotId_network_assessment_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."network_assessment_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_assessment_input_rollups" ADD CONSTRAINT "network_assessment_input_rollups_rollupId_network_measurement_rollups_id_fk" FOREIGN KEY ("rollupId") REFERENCES "public"."network_measurement_rollups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_assessment_publication_events" ADD CONSTRAINT "network_assessment_publication_events_candidateId_network_line_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."network_line_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_assessment_publication_events" ADD CONSTRAINT "network_assessment_publication_events_snapshotId_network_assessment_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."network_assessment_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_assessment_publication_events" ADD CONSTRAINT "network_assessment_publication_events_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_assessment_snapshots" ADD CONSTRAINT "network_assessment_snapshots_candidateId_network_line_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."network_line_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_assessment_snapshots" ADD CONSTRAINT "network_assessment_snapshots_candidateRevisionId_network_line_candidate_revisions_id_fk" FOREIGN KEY ("candidateRevisionId") REFERENCES "public"."network_line_candidate_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_assessment_snapshots" ADD CONSTRAINT "network_assessment_snapshots_routeStateSnapshotId_network_route_state_snapshots_id_fk" FOREIGN KEY ("routeStateSnapshotId") REFERENCES "public"."network_route_state_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_assessment_sources" ADD CONSTRAINT "network_assessment_sources_snapshotId_network_assessment_snapshots_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."network_assessment_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_assessment_sources" ADD CONSTRAINT "network_assessment_sources_sourceRevisionId_knowledge_source_revisions_id_fk" FOREIGN KEY ("sourceRevisionId") REFERENCES "public"."knowledge_source_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_line_candidate_revisions" ADD CONSTRAINT "network_line_candidate_revisions_candidateId_network_line_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."network_line_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_line_candidate_revisions" ADD CONSTRAINT "network_line_candidate_revisions_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_line_candidates" ADD CONSTRAINT "network_line_candidates_providerId_aff_service_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."aff_service_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_campaign_revisions" ADD CONSTRAINT "network_measurement_campaign_revisions_campaignId_network_measurement_campaigns_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."network_measurement_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_campaigns" ADD CONSTRAINT "network_measurement_campaigns_candidateId_network_line_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."network_line_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_credentials" ADD CONSTRAINT "network_measurement_credentials_probeId_network_measurement_probes_id_fk" FOREIGN KEY ("probeId") REFERENCES "public"."network_measurement_probes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_credentials" ADD CONSTRAINT "network_measurement_credentials_targetAgentId_network_target_agents_id_fk" FOREIGN KEY ("targetAgentId") REFERENCES "public"."network_target_agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_credentials" ADD CONSTRAINT "network_measurement_credentials_rotationOfId_self_fk" FOREIGN KEY ("rotationOfId") REFERENCES "public"."network_measurement_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_ingest_nonces" ADD CONSTRAINT "network_measurement_ingest_nonces_credentialId_network_measurement_credentials_id_fk" FOREIGN KEY ("credentialId") REFERENCES "public"."network_measurement_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_probe_revisions" ADD CONSTRAINT "network_measurement_probe_revisions_probeId_network_measurement_probes_id_fk" FOREIGN KEY ("probeId") REFERENCES "public"."network_measurement_probes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_raw_batches" ADD CONSTRAINT "network_measurement_raw_batches_runId_network_measurement_runs_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."network_measurement_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_raw_batches" ADD CONSTRAINT "network_measurement_raw_batches_credentialId_network_measurement_credentials_id_fk" FOREIGN KEY ("credentialId") REFERENCES "public"."network_measurement_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_rollups" ADD CONSTRAINT "network_measurement_rollups_candidateId_network_line_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."network_line_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_rollups" ADD CONSTRAINT "network_measurement_rollups_targetRevisionId_network_measurement_target_revisions_id_fk" FOREIGN KEY ("targetRevisionId") REFERENCES "public"."network_measurement_target_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_rollups" ADD CONSTRAINT "network_measurement_rollups_probeRevisionId_network_measurement_probe_revisions_id_fk" FOREIGN KEY ("probeRevisionId") REFERENCES "public"."network_measurement_probe_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_rollups" ADD CONSTRAINT "network_measurement_rollups_campaignRevisionId_network_measurement_campaign_revisions_id_fk" FOREIGN KEY ("campaignRevisionId") REFERENCES "public"."network_measurement_campaign_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_runs" ADD CONSTRAINT "network_measurement_runs_campaignId_network_measurement_campaigns_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."network_measurement_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_runs" ADD CONSTRAINT "network_measurement_runs_campaignRevisionId_network_measurement_campaign_revisions_id_fk" FOREIGN KEY ("campaignRevisionId") REFERENCES "public"."network_measurement_campaign_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_samples" ADD CONSTRAINT "network_measurement_samples_runId_network_measurement_runs_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."network_measurement_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_samples" ADD CONSTRAINT "network_measurement_samples_rawBatchId_network_measurement_raw_batches_id_fk" FOREIGN KEY ("rawBatchId") REFERENCES "public"."network_measurement_raw_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_samples" ADD CONSTRAINT "network_measurement_samples_probeRevisionId_network_measurement_probe_revisions_id_fk" FOREIGN KEY ("probeRevisionId") REFERENCES "public"."network_measurement_probe_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_samples" ADD CONSTRAINT "network_measurement_samples_targetRevisionId_network_measurement_target_revisions_id_fk" FOREIGN KEY ("targetRevisionId") REFERENCES "public"."network_measurement_target_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_target_revisions" ADD CONSTRAINT "network_measurement_target_revisions_targetId_network_measurement_targets_id_fk" FOREIGN KEY ("targetId") REFERENCES "public"."network_measurement_targets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_target_revisions" ADD CONSTRAINT "network_measurement_target_revisions_targetAgentRevisionId_network_target_agent_revisions_id_fk" FOREIGN KEY ("targetAgentRevisionId") REFERENCES "public"."network_target_agent_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_measurement_targets" ADD CONSTRAINT "network_measurement_targets_candidateId_network_line_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."network_line_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_route_observations" ADD CONSTRAINT "network_route_observations_targetRevisionId_network_measurement_target_revisions_id_fk" FOREIGN KEY ("targetRevisionId") REFERENCES "public"."network_measurement_target_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_route_state_heads" ADD CONSTRAINT "network_route_state_heads_candidateId_network_line_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."network_line_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_route_state_heads" ADD CONSTRAINT "network_route_state_heads_routeStateSnapshotId_network_route_state_snapshots_id_fk" FOREIGN KEY ("routeStateSnapshotId") REFERENCES "public"."network_route_state_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_route_state_inputs" ADD CONSTRAINT "network_route_state_inputs_routeStateSnapshotId_network_route_state_snapshots_id_fk" FOREIGN KEY ("routeStateSnapshotId") REFERENCES "public"."network_route_state_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_route_state_inputs" ADD CONSTRAINT "network_route_state_inputs_routeObservationId_network_route_observations_id_fk" FOREIGN KEY ("routeObservationId") REFERENCES "public"."network_route_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_route_state_snapshots" ADD CONSTRAINT "network_route_state_snapshots_candidateRevisionId_network_line_candidate_revisions_id_fk" FOREIGN KEY ("candidateRevisionId") REFERENCES "public"."network_line_candidate_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_target_agent_revisions" ADD CONSTRAINT "network_target_agent_revisions_targetAgentId_network_target_agents_id_fk" FOREIGN KEY ("targetAgentId") REFERENCES "public"."network_target_agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_target_agents" ADD CONSTRAINT "network_target_agents_candidateId_network_line_candidates_id_fk" FOREIGN KEY ("candidateId") REFERENCES "public"."network_line_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_target_prefix_verifications" ADD CONSTRAINT "network_target_prefix_verifications_targetRevisionId_network_measurement_target_revisions_id_fk" FOREIGN KEY ("targetRevisionId") REFERENCES "public"."network_measurement_target_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_target_prefix_verifications" ADD CONSTRAINT "network_target_prefix_verifications_verifiedBy_users_id_fk" FOREIGN KEY ("verifiedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_sizing_rule_sets" ADD CONSTRAINT "server_sizing_rule_sets_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_sizing_rule_sets" ADD CONSTRAINT "server_sizing_rule_sets_reviewedBy_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_sizing_rule_sets" ADD CONSTRAINT "server_sizing_rule_sets_publishedBy_users_id_fk" FOREIGN KEY ("publishedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_sizing_rule_sources" ADD CONSTRAINT "server_sizing_rule_sources_ruleSetId_server_sizing_rule_sets_id_fk" FOREIGN KEY ("ruleSetId") REFERENCES "public"."server_sizing_rule_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_sizing_rule_sources" ADD CONSTRAINT "server_sizing_rule_sources_sourceRevisionId_knowledge_source_revisions_id_fk" FOREIGN KEY ("sourceRevisionId") REFERENCES "public"."knowledge_source_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_article_modules_sourceArticleId_idx" ON "knowledge_article_modules" USING btree ("sourceArticleId","enabled");--> statement-breakpoint
CREATE INDEX "knowledge_article_sources_articleId_idx" ON "knowledge_article_sources" USING btree ("articleId");--> statement-breakpoint
CREATE INDEX "knowledge_article_sources_sourceRevisionId_idx" ON "knowledge_article_sources" USING btree ("sourceRevisionId");--> statement-breakpoint
CREATE INDEX "knowledge_article_versions_articleId_createdAt_idx" ON "knowledge_article_versions" USING btree ("articleId","createdAt");--> statement-breakpoint
CREATE INDEX "knowledge_source_revisions_sourceId_idx" ON "knowledge_source_revisions" USING btree ("sourceId");--> statement-breakpoint
CREATE INDEX "knowledge_sources_sourceKey_idx" ON "knowledge_sources" USING btree ("sourceKey");--> statement-breakpoint
CREATE INDEX "knowledge_sources_currentRevisionId_idx" ON "knowledge_sources" USING btree ("currentRevisionId");--> statement-breakpoint
CREATE INDEX "knowledge_sources_status_reviewDueAt_idx" ON "knowledge_sources" USING btree ("status","reviewDueAt");--> statement-breakpoint
CREATE INDEX "network_assessment_heads_candidate_snapshot_idx" ON "network_assessment_heads" USING btree ("candidateId","snapshotId");--> statement-breakpoint
CREATE INDEX "network_assessment_publication_events_candidate_created_idx" ON "network_assessment_publication_events" USING btree ("candidateId","createdAt");--> statement-breakpoint
CREATE INDEX "network_assessment_snapshots_candidate_profile_created_idx" ON "network_assessment_snapshots" USING btree ("candidateId","audienceProfileKey","createdAt");--> statement-breakpoint
CREATE INDEX "network_assessment_snapshots_validUntil_idx" ON "network_assessment_snapshots" USING btree ("validUntil");--> statement-breakpoint
CREATE INDEX "network_line_candidate_revisions_candidateId_idx" ON "network_line_candidate_revisions" USING btree ("candidateId","createdAt");--> statement-breakpoint
CREATE INDEX "network_line_candidates_providerId_idx" ON "network_line_candidates" USING btree ("providerId");--> statement-breakpoint
CREATE INDEX "network_line_candidates_status_idx" ON "network_line_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "network_measurement_campaigns_candidate_status_idx" ON "network_measurement_campaigns" USING btree ("candidateId","status");--> statement-breakpoint
CREATE INDEX "network_measurement_ingest_nonces_expiresAt_idx" ON "network_measurement_ingest_nonces" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "network_measurement_probe_revisions_probeId_idx" ON "network_measurement_probe_revisions" USING btree ("probeId","createdAt");--> statement-breakpoint
CREATE INDEX "network_measurement_probes_status_lastSeenAt_idx" ON "network_measurement_probes" USING btree ("status","lastSeenAt");--> statement-breakpoint
CREATE INDEX "network_measurement_raw_batches_expiresAt_idx" ON "network_measurement_raw_batches" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "network_measurement_rollups_candidate_window_idx" ON "network_measurement_rollups" USING btree ("candidateId","windowStart","windowEnd");--> statement-breakpoint
CREATE INDEX "network_measurement_runs_status_slotAt_idx" ON "network_measurement_runs" USING btree ("status","slotAt");--> statement-breakpoint
CREATE INDEX "network_measurement_samples_runId_observedAt_idx" ON "network_measurement_samples" USING btree ("runId","observedAt");--> statement-breakpoint
CREATE INDEX "network_measurement_samples_targetRevisionId_observedAt_idx" ON "network_measurement_samples" USING btree ("targetRevisionId","observedAt");--> statement-breakpoint
CREATE INDEX "network_measurement_targets_candidateId_idx" ON "network_measurement_targets" USING btree ("candidateId","enabled");--> statement-breakpoint
CREATE INDEX "network_route_observations_target_observed_idx" ON "network_route_observations" USING btree ("targetRevisionId","observedAt");--> statement-breakpoint
CREATE INDEX "network_target_agents_candidateId_idx" ON "network_target_agents" USING btree ("candidateId");--> statement-breakpoint
CREATE INDEX "network_target_prefix_verifications_targetRevisionId_validUntil_idx" ON "network_target_prefix_verifications" USING btree ("targetRevisionId","validUntil");--> statement-breakpoint
CREATE UNIQUE INDEX "server_sizing_rule_sets_published_unique" ON "server_sizing_rule_sets" USING btree ("status") WHERE "server_sizing_rule_sets"."status" = 'published';--> statement-breakpoint
CREATE INDEX "server_sizing_rule_sets_status_createdAt_idx" ON "server_sizing_rule_sets" USING btree ("status","createdAt");