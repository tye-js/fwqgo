ALTER TABLE "homepage_slots" DROP CONSTRAINT "homepage_slots_content_check";--> statement-breakpoint

-- Normalize historical values before enforcing the stronger invariants.
UPDATE "provider_monitor_runs"
SET
	"received" = greatest("received", 0),
	"created" = greatest("created", 0),
	"pending" = greatest("pending", 0),
	"updated" = greatest("updated", 0),
	"unchanged" = greatest("unchanged", 0),
	"skipped" = greatest("skipped", 0),
	"missing" = greatest("missing", 0),
	"httpStatus" = CASE
		WHEN "httpStatus" BETWEEN 100 AND 599 THEN "httpStatus"
		ELSE NULL
	END;--> statement-breakpoint

UPDATE "server_offer_checks"
SET
	"status" = CASE WHEN lower(btrim("status")) = 'ok' THEN 'ok' ELSE 'failed' END,
	"priceAmount" = CASE WHEN "priceAmount" >= 0 THEN "priceAmount" ELSE NULL END,
	"currency" = CASE
		WHEN upper(btrim("currency")) IN ('USD', 'CNY') THEN upper(btrim("currency"))
		ELSE NULL
	END;--> statement-breakpoint

UPDATE "server_offers"
SET
	"priceAmount" = CASE WHEN "priceAmount" >= 0 THEN "priceAmount" ELSE NULL END,
	"originalPriceAmount" = CASE WHEN "originalPriceAmount" >= 0 THEN "originalPriceAmount" ELSE NULL END,
	"monthlyPriceUsd" = CASE WHEN "monthlyPriceUsd" >= 0 THEN "monthlyPriceUsd" ELSE NULL END,
	"currency" = CASE
		WHEN "currency" IS NULL OR btrim("currency") = '' THEN
			CASE WHEN "priceAmount" IS NOT NULL THEN 'USD' ELSE NULL END
		WHEN upper(btrim("currency")) IN ('USD', 'CNY') THEN upper(btrim("currency"))
		ELSE NULL
	END;--> statement-breakpoint

WITH cycle_aliases("alias", "cycle") AS (
	VALUES
		('monthly', 'monthly'), ('month', 'monthly'), ('mo', 'monthly'), ('1month', 'monthly'), ('月', 'monthly'), ('月付', 'monthly'),
		('quarterly', 'quarterly'), ('quarter', 'quarterly'), ('3month', 'quarterly'), ('3months', 'quarterly'), ('季付', 'quarterly'),
		('semiannual', 'semiannual'), ('semiannually', 'semiannual'), ('halfyear', 'semiannual'), ('6month', 'semiannual'), ('6months', 'semiannual'), ('半年付', 'semiannual'),
		('yearly', 'yearly'), ('annual', 'yearly'), ('annually', 'yearly'), ('year', 'yearly'), ('yr', 'yearly'), ('12month', 'yearly'), ('12months', 'yearly'), ('年付', 'yearly'),
		('biennial', 'biennial'), ('biennially', 'biennial'), ('2year', 'biennial'), ('2years', 'biennial'), ('24month', 'biennial'), ('24months', 'biennial'), ('两年付', 'biennial'),
		('triennial', 'triennial'), ('triennially', 'triennial'), ('3year', 'triennial'), ('3years', 'triennial'), ('36month', 'triennial'), ('36months', 'triennial'), ('三年付', 'triennial')
)
UPDATE "server_offers" AS offers
SET "billingCycle" = cycle_aliases."cycle"
FROM cycle_aliases
WHERE regexp_replace(lower(btrim(offers."billingCycle")), '[[:space:]_-]+', '', 'g') = cycle_aliases."alias";--> statement-breakpoint

UPDATE "server_offers"
SET "billingCycle" = CASE WHEN "priceAmount" IS NOT NULL THEN 'monthly' ELSE NULL END
WHERE "billingCycle" IS NULL
	OR btrim("billingCycle") = ''
	OR "billingCycle" NOT IN ('monthly', 'quarterly', 'semiannual', 'yearly', 'biennial', 'triennial');--> statement-breakpoint

UPDATE "server_offers"
SET "monthlyPriceUsd" = CASE
	WHEN "priceAmount" IS NULL OR "currency" IS NULL OR "billingCycle" IS NULL THEN NULL
	ELSE round(
		(CASE WHEN "currency" = 'CNY' THEN "priceAmount" / 7.2::numeric ELSE "priceAmount" END) /
		(CASE "billingCycle"
			WHEN 'quarterly' THEN 3
			WHEN 'semiannual' THEN 6
			WHEN 'yearly' THEN 12
			WHEN 'biennial' THEN 24
			WHEN 'triennial' THEN 36
			ELSE 1
		END),
		4
	)
END;--> statement-breakpoint

WITH cycle_aliases("alias", "cycle", "months") AS (
	VALUES
		('monthly', 'monthly', 1), ('month', 'monthly', 1), ('mo', 'monthly', 1), ('1month', 'monthly', 1), ('月', 'monthly', 1), ('月付', 'monthly', 1),
		('quarterly', 'quarterly', 3), ('quarter', 'quarterly', 3), ('3month', 'quarterly', 3), ('3months', 'quarterly', 3), ('季付', 'quarterly', 3),
		('semiannual', 'semiannual', 6), ('semiannually', 'semiannual', 6), ('halfyear', 'semiannual', 6), ('6month', 'semiannual', 6), ('6months', 'semiannual', 6), ('半年付', 'semiannual', 6),
		('yearly', 'yearly', 12), ('annual', 'yearly', 12), ('annually', 'yearly', 12), ('year', 'yearly', 12), ('yr', 'yearly', 12), ('12month', 'yearly', 12), ('12months', 'yearly', 12), ('年付', 'yearly', 12),
		('biennial', 'biennial', 24), ('biennially', 'biennial', 24), ('2year', 'biennial', 24), ('2years', 'biennial', 24), ('24month', 'biennial', 24), ('24months', 'biennial', 24), ('两年付', 'biennial', 24),
		('triennial', 'triennial', 36), ('triennially', 'triennial', 36), ('3year', 'triennial', 36), ('3years', 'triennial', 36), ('36month', 'triennial', 36), ('36months', 'triennial', 36), ('三年付', 'triennial', 36)
), normalized_prices AS (
	SELECT
		prices."id",
		cycle_aliases."cycle",
		upper(btrim(prices."currency")) AS "currency",
		row_number() OVER (
			PARTITION BY prices."offerId", cycle_aliases."cycle", upper(btrim(prices."currency"))
			ORDER BY
				(cycle_aliases."cycle" IS NOT NULL
					AND upper(btrim(prices."currency")) IN ('USD', 'CNY')
					AND prices."amount" >= 0
					AND prices."monthlyPriceUsd" >= 0) DESC,
				prices."active" DESC,
				prices."updatedAt" DESC NULLS LAST,
				prices."createdAt" DESC,
				prices."id" DESC
		) AS "rowNumber"
	FROM "server_offer_prices" AS prices
	LEFT JOIN cycle_aliases
		ON regexp_replace(lower(btrim(prices."billingCycle")), '[[:space:]_-]+', '', 'g') = cycle_aliases."alias"
)
DELETE FROM "server_offer_prices" AS prices
USING normalized_prices
WHERE prices."id" = normalized_prices."id"
	AND (
		normalized_prices."cycle" IS NULL
		OR normalized_prices."currency" NOT IN ('USD', 'CNY')
		OR prices."amount" < 0
		OR prices."monthlyPriceUsd" < 0
		OR normalized_prices."rowNumber" > 1
	);--> statement-breakpoint

WITH cycle_aliases("alias", "cycle", "months") AS (
	VALUES
		('monthly', 'monthly', 1), ('month', 'monthly', 1), ('mo', 'monthly', 1), ('1month', 'monthly', 1), ('月', 'monthly', 1), ('月付', 'monthly', 1),
		('quarterly', 'quarterly', 3), ('quarter', 'quarterly', 3), ('3month', 'quarterly', 3), ('3months', 'quarterly', 3), ('季付', 'quarterly', 3),
		('semiannual', 'semiannual', 6), ('semiannually', 'semiannual', 6), ('halfyear', 'semiannual', 6), ('6month', 'semiannual', 6), ('6months', 'semiannual', 6), ('半年付', 'semiannual', 6),
		('yearly', 'yearly', 12), ('annual', 'yearly', 12), ('annually', 'yearly', 12), ('year', 'yearly', 12), ('yr', 'yearly', 12), ('12month', 'yearly', 12), ('12months', 'yearly', 12), ('年付', 'yearly', 12),
		('biennial', 'biennial', 24), ('biennially', 'biennial', 24), ('2year', 'biennial', 24), ('2years', 'biennial', 24), ('24month', 'biennial', 24), ('24months', 'biennial', 24), ('两年付', 'biennial', 24),
		('triennial', 'triennial', 36), ('triennially', 'triennial', 36), ('3year', 'triennial', 36), ('3years', 'triennial', 36), ('36month', 'triennial', 36), ('36months', 'triennial', 36), ('三年付', 'triennial', 36)
)
UPDATE "server_offer_prices" AS prices
SET
	"billingCycle" = cycle_aliases."cycle",
	"termMonths" = cycle_aliases."months",
	"currency" = upper(btrim(prices."currency")),
	"originalAmount" = CASE WHEN prices."originalAmount" >= 0 THEN prices."originalAmount" ELSE NULL END,
	"monthlyPriceUsd" = round(
		(CASE WHEN upper(btrim(prices."currency")) = 'CNY' THEN prices."amount" / 7.2::numeric ELSE prices."amount" END) /
		cycle_aliases."months",
		4
	)
FROM cycle_aliases
WHERE regexp_replace(lower(btrim(prices."billingCycle")), '[[:space:]_-]+', '', 'g') = cycle_aliases."alias";--> statement-breakpoint

WITH fillable_sources AS (
	SELECT
		sources."id",
		offers."externalProductId",
		row_number() OVER (
			PARTITION BY sources."offerId", offers."externalProductId"
			ORDER BY sources."id"
		) AS "rowNumber"
	FROM "server_offer_sources" AS sources
	INNER JOIN "server_offers" AS offers ON sources."offerId" = offers."id"
	WHERE sources."sourceType" = 'provider'
		AND nullif(btrim(sources."externalId"), '') IS NULL
		AND nullif(btrim(offers."externalProductId"), '') IS NOT NULL
		AND NOT EXISTS (
			SELECT 1
			FROM "server_offer_sources" AS existing
			WHERE existing."offerId" = sources."offerId"
				AND existing."sourceType" = 'provider'
				AND existing."externalId" = offers."externalProductId"
		)
)
UPDATE "server_offer_sources" AS sources
SET "externalId" = fillable_sources."externalProductId"
FROM fillable_sources
WHERE sources."id" = fillable_sources."id"
	AND fillable_sources."rowNumber" = 1;--> statement-breakpoint

UPDATE "server_offer_sources"
SET
	"sourceType" = 'monitor',
	"sourcePostId" = NULL,
	"externalId" = NULL,
	"relationType" = NULL
WHERE "sourceType" NOT IN ('article', 'provider', 'monitor')
	OR ("sourceType" = 'provider' AND nullif(btrim("externalId"), '') IS NULL);--> statement-breakpoint

UPDATE "server_offer_sources"
SET
	"sourcePostId" = CASE WHEN "sourceType" = 'article' THEN "sourcePostId" ELSE NULL END,
	"relationType" = CASE
		WHEN "sourceType" = 'article' THEN coalesce("relationType", 'mention')
		ELSE NULL
	END;--> statement-breakpoint

UPDATE "server_offers" AS offers
SET
	"sourceMonitorId" = NULL,
	"sourceHash" = NULL,
	"sourceLastSeenAt" = NULL,
	"missingRuns" = 0,
	"checkStatus" = 'unknown',
	"lastCheckedAt" = NULL
WHERE offers."sourceMonitorId" IS NOT NULL
	AND (
		nullif(btrim(offers."externalProductId"), '') IS NULL
		OR NOT EXISTS (
			SELECT 1
			FROM "provider_monitors" AS monitors
			WHERE monitors."id" = offers."sourceMonitorId"
				AND monitors."providerId" = offers."providerId"
		)
	);--> statement-breakpoint

UPDATE "provider_offer_candidates" AS candidates
SET "providerId" = monitors."providerId"
FROM "provider_monitors" AS monitors
WHERE candidates."monitorId" = monitors."id"
	AND candidates."providerId" <> monitors."providerId";--> statement-breakpoint

UPDATE "provider_offer_candidates" AS candidates
SET
	"offerId" = NULL,
	"status" = CASE WHEN candidates."status" = 'accepted' THEN 'pending' ELSE candidates."status" END,
	"reviewedBy" = CASE WHEN candidates."status" = 'accepted' THEN NULL ELSE candidates."reviewedBy" END,
	"reviewedAt" = CASE WHEN candidates."status" = 'accepted' THEN NULL ELSE candidates."reviewedAt" END,
	"rejectionReason" = CASE WHEN candidates."status" = 'accepted' THEN NULL ELSE candidates."rejectionReason" END,
	"updatedAt" = now()
WHERE candidates."offerId" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM "server_offers" AS offers
		WHERE offers."id" = candidates."offerId"
			AND offers."providerId" = candidates."providerId"
	);--> statement-breakpoint

UPDATE "server_offers" AS offers
SET
	"reviewStatus" = 'pending',
	"mergedIntoOfferId" = NULL,
	"reviewedAt" = NULL
WHERE offers."reviewStatus" NOT IN ('pending', 'reviewed', 'needs_fix', 'duplicate', 'merged')
	OR (
		offers."reviewStatus" = 'merged'
		AND (
			offers."mergedIntoOfferId" IS NULL
			OR offers."mergedIntoOfferId" = offers."id"
			OR NOT EXISTS (
				SELECT 1
				FROM "server_offers" AS target
				WHERE target."id" = offers."mergedIntoOfferId"
			)
		)
	);--> statement-breakpoint

UPDATE "server_offers"
SET "mergedIntoOfferId" = NULL
WHERE "reviewStatus" <> 'merged' AND "mergedIntoOfferId" IS NOT NULL;--> statement-breakpoint

UPDATE "server_offers"
SET "reviewedAt" = CASE
	WHEN "reviewStatus" = 'pending' THEN NULL
	ELSE coalesce("reviewedAt", "updatedAt", "createdAt", now())
END;--> statement-breakpoint

DELETE FROM "homepage_slots"
WHERE "contentType" NOT IN ('post', 'offer', 'image_link')
	OR ("contentType" = 'post' AND "postId" IS NULL)
	OR ("contentType" = 'offer' AND "offerId" IS NULL)
	OR (
		"contentType" = 'image_link'
		AND ("imageAssetId" IS NULL OR nullif(btrim("targetUrl"), '') IS NULL)
	);--> statement-breakpoint

UPDATE "homepage_slots"
SET
	"postId" = CASE WHEN "contentType" = 'post' THEN "postId" ELSE NULL END,
	"offerId" = CASE WHEN "contentType" = 'offer' THEN "offerId" ELSE NULL END;--> statement-breakpoint

-- Composite foreign keys require these exact referenced keys first.
ALTER TABLE "provider_monitors" ADD CONSTRAINT "provider_monitors_id_providerId_unique" UNIQUE("id","providerId");--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_id_providerId_unique" UNIQUE("id","providerId");--> statement-breakpoint
ALTER TABLE "provider_offer_candidates" ADD CONSTRAINT "provider_offer_candidates_monitorId_providerId_provider_monitors_fk" FOREIGN KEY ("monitorId","providerId") REFERENCES "public"."provider_monitors"("id","providerId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_offer_candidates" ADD CONSTRAINT "provider_offer_candidates_offerId_providerId_server_offers_fk" FOREIGN KEY ("offerId","providerId") REFERENCES "public"."server_offers"("id","providerId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_sourceMonitorId_providerId_provider_monitors_fk" FOREIGN KEY ("sourceMonitorId","providerId") REFERENCES "public"."provider_monitors"("id","providerId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_mergedIntoOfferId_server_offers_id_fk" FOREIGN KEY ("mergedIntoOfferId") REFERENCES "public"."server_offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "server_offers_mergedIntoOfferId_idx" ON "server_offers" USING btree ("mergedIntoOfferId");--> statement-breakpoint
ALTER TABLE "homepage_slots" ADD CONSTRAINT "homepage_slots_content_check" CHECK (("homepage_slots"."contentType" = 'post' and "homepage_slots"."postId" is not null and "homepage_slots"."offerId" is null)
		or ("homepage_slots"."contentType" = 'offer' and "homepage_slots"."offerId" is not null and "homepage_slots"."postId" is null)
		or ("homepage_slots"."contentType" = 'image_link' and "homepage_slots"."imageAssetId" is not null and "homepage_slots"."postId" is null and "homepage_slots"."offerId" is null and nullif(btrim("homepage_slots"."targetUrl"), '') is not null));--> statement-breakpoint
ALTER TABLE "provider_monitor_runs" ADD CONSTRAINT "provider_monitor_runs_counters_check" CHECK (least(
		"provider_monitor_runs"."received",
		"provider_monitor_runs"."created",
		"provider_monitor_runs"."pending",
		"provider_monitor_runs"."updated",
		"provider_monitor_runs"."unchanged",
		"provider_monitor_runs"."skipped",
		"provider_monitor_runs"."missing"
	) >= 0);--> statement-breakpoint
ALTER TABLE "provider_monitor_runs" ADD CONSTRAINT "provider_monitor_runs_httpStatus_check" CHECK ("provider_monitor_runs"."httpStatus" is null or "provider_monitor_runs"."httpStatus" between 100 and 599);--> statement-breakpoint
ALTER TABLE "server_offer_checks" ADD CONSTRAINT "server_offer_checks_status_check" CHECK ("server_offer_checks"."status" in ('ok', 'failed'));--> statement-breakpoint
ALTER TABLE "server_offer_checks" ADD CONSTRAINT "server_offer_checks_priceAmount_check" CHECK ("server_offer_checks"."priceAmount" is null or "server_offer_checks"."priceAmount" >= 0);--> statement-breakpoint
ALTER TABLE "server_offer_checks" ADD CONSTRAINT "server_offer_checks_currency_check" CHECK ("server_offer_checks"."currency" is null or "server_offer_checks"."currency" in ('USD', 'CNY'));--> statement-breakpoint
ALTER TABLE "server_offer_prices" ADD CONSTRAINT "server_offer_prices_originalAmount_check" CHECK ("server_offer_prices"."originalAmount" is null or "server_offer_prices"."originalAmount" >= 0);--> statement-breakpoint
ALTER TABLE "server_offer_prices" ADD CONSTRAINT "server_offer_prices_monthlyPriceUsd_check" CHECK ("server_offer_prices"."monthlyPriceUsd" >= 0);--> statement-breakpoint
ALTER TABLE "server_offer_prices" ADD CONSTRAINT "server_offer_prices_billingCycle_check" CHECK ("server_offer_prices"."billingCycle" in ('monthly', 'quarterly', 'semiannual', 'yearly', 'biennial', 'triennial'));--> statement-breakpoint
ALTER TABLE "server_offer_prices" ADD CONSTRAINT "server_offer_prices_currency_check" CHECK ("server_offer_prices"."currency" in ('USD', 'CNY'));--> statement-breakpoint
ALTER TABLE "server_offer_prices" ADD CONSTRAINT "server_offer_prices_billingCycle_termMonths_check" CHECK (("server_offer_prices"."billingCycle" = 'monthly' and "server_offer_prices"."termMonths" = 1)
		or ("server_offer_prices"."billingCycle" = 'quarterly' and "server_offer_prices"."termMonths" = 3)
		or ("server_offer_prices"."billingCycle" = 'semiannual' and "server_offer_prices"."termMonths" = 6)
		or ("server_offer_prices"."billingCycle" = 'yearly' and "server_offer_prices"."termMonths" = 12)
		or ("server_offer_prices"."billingCycle" = 'biennial' and "server_offer_prices"."termMonths" = 24)
		or ("server_offer_prices"."billingCycle" = 'triennial' and "server_offer_prices"."termMonths" = 36));--> statement-breakpoint
ALTER TABLE "server_offer_sources" ADD CONSTRAINT "server_offer_sources_sourceType_check" CHECK ("server_offer_sources"."sourceType" in ('article', 'provider', 'monitor'));--> statement-breakpoint
ALTER TABLE "server_offer_sources" ADD CONSTRAINT "server_offer_sources_relation_scope_check" CHECK (("server_offer_sources"."sourceType" = 'article' and "server_offer_sources"."relationType" is not null)
		or ("server_offer_sources"."sourceType" <> 'article' and "server_offer_sources"."relationType" is null));--> statement-breakpoint
ALTER TABLE "server_offer_sources" ADD CONSTRAINT "server_offer_sources_provider_externalId_check" CHECK ("server_offer_sources"."sourceType" <> 'provider' or nullif(btrim("server_offer_sources"."externalId"), '') is not null);--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_reviewStatus_check" CHECK ("server_offers"."reviewStatus" in ('pending', 'reviewed', 'needs_fix', 'duplicate', 'merged'));--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_reviewedAt_check" CHECK (("server_offers"."reviewStatus" = 'pending' and "server_offers"."reviewedAt" is null) or ("server_offers"."reviewStatus" <> 'pending' and "server_offers"."reviewedAt" is not null));--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_merged_target_check" CHECK (("server_offers"."reviewStatus" = 'merged') = ("server_offers"."mergedIntoOfferId" is not null));--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_merged_not_self_check" CHECK ("server_offers"."mergedIntoOfferId" is null or "server_offers"."mergedIntoOfferId" <> "server_offers"."id");--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_sourceMonitor_provider_check" CHECK ("server_offers"."sourceMonitorId" is null or ("server_offers"."providerId" is not null and nullif(btrim("server_offers"."externalProductId"), '') is not null));--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_priceAmount_check" CHECK ("server_offers"."priceAmount" is null or "server_offers"."priceAmount" >= 0);--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_originalPriceAmount_check" CHECK ("server_offers"."originalPriceAmount" is null or "server_offers"."originalPriceAmount" >= 0);--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_monthlyPriceUsd_check" CHECK ("server_offers"."monthlyPriceUsd" is null or "server_offers"."monthlyPriceUsd" >= 0);--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_currency_check" CHECK ("server_offers"."currency" is null or "server_offers"."currency" in ('USD', 'CNY'));--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_billingCycle_check" CHECK ("server_offers"."billingCycle" is null or "server_offers"."billingCycle" in ('monthly', 'quarterly', 'semiannual', 'yearly', 'biennial', 'triennial'));
