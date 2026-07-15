CREATE TABLE "homepage_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"language" varchar(8) DEFAULT 'zh' NOT NULL,
	"placement" varchar(40) NOT NULL,
	"contentType" varchar(24) NOT NULL,
	"postId" integer,
	"offerId" integer,
	"imageAssetId" integer,
	"title" text,
	"description" varchar(800),
	"targetUrl" text,
	"altText" text,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"startsAt" timestamp,
	"endsAt" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"trackingKey" varchar(160),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "homepage_slots_trackingKey_unique" UNIQUE("trackingKey"),
	CONSTRAINT "homepage_slots_content_check" CHECK (("homepage_slots"."contentType" = 'post' and "homepage_slots"."postId" is not null) or ("homepage_slots"."contentType" = 'offer' and "homepage_slots"."offerId" is not null) or ("homepage_slots"."contentType" = 'image_link' and "homepage_slots"."imageAssetId" is not null)),
	CONSTRAINT "homepage_slots_schedule_check" CHECK ("homepage_slots"."endsAt" is null or "homepage_slots"."startsAt" is null or "homepage_slots"."endsAt" > "homepage_slots"."startsAt")
);
--> statement-breakpoint
CREATE TABLE "provider_monitors" (
	"id" serial PRIMARY KEY NOT NULL,
	"providerId" integer NOT NULL,
	"name" text NOT NULL,
	"adapter" varchar(40) DEFAULT 'json' NOT NULL,
	"endpointUrl" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"intervalMinutes" integer DEFAULT 30 NOT NULL,
	"timeoutSeconds" integer DEFAULT 30 NOT NULL,
	"lastRunAt" timestamp,
	"nextRunAt" timestamp,
	"lastStatus" varchar(24) DEFAULT 'idle' NOT NULL,
	"lastError" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "provider_monitors_providerId_name_unique" UNIQUE("providerId","name"),
	CONSTRAINT "provider_monitors_intervalMinutes_check" CHECK ("provider_monitors"."intervalMinutes" between 1 and 10080),
	CONSTRAINT "provider_monitors_timeoutSeconds_check" CHECK ("provider_monitors"."timeoutSeconds" between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "server_network_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(120) NOT NULL,
	"name" text NOT NULL,
	"enName" text,
	"aliases" text,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "server_network_lines_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "server_offer_checks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"offerId" integer NOT NULL,
	"monitorId" integer,
	"status" varchar(24) NOT NULL,
	"available" boolean,
	"priceAmount" numeric(12, 2),
	"currency" varchar(16),
	"responseTimeMs" integer,
	"error" text,
	"checkedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_offer_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"offerId" integer NOT NULL,
	"billingCycle" varchar(40) NOT NULL,
	"termMonths" integer DEFAULT 1 NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"originalAmount" numeric(12, 2),
	"currency" varchar(16) DEFAULT 'USD' NOT NULL,
	"monthlyPriceUsd" numeric(14, 4) NOT NULL,
	"purchaseUrl" text,
	"active" boolean DEFAULT true NOT NULL,
	"validUntil" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "server_offer_prices_offerId_billingCycle_currency_unique" UNIQUE("offerId","billingCycle","currency"),
	CONSTRAINT "server_offer_prices_amount_check" CHECK ("server_offer_prices"."amount" >= 0),
	CONSTRAINT "server_offer_prices_termMonths_check" CHECK ("server_offer_prices"."termMonths" between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "server_offer_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"offerId" integer NOT NULL,
	"sourceType" varchar(40) NOT NULL,
	"sourcePostId" integer,
	"sourceUrl" text,
	"externalId" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "server_offer_tags" (
	"offerId" integer NOT NULL,
	"slug" varchar(160) NOT NULL,
	"label" text NOT NULL,
	"kind" varchar(40) DEFAULT 'feature' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "server_offer_tags_offerId_slug_pk" PRIMARY KEY("offerId","slug")
);
--> statement-breakpoint
CREATE TABLE "server_regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(120) NOT NULL,
	"name" text NOT NULL,
	"enName" text,
	"aliases" text,
	"countryCode" varchar(16),
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "server_regions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "slug" varchar(160);--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "aliases" text;--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD COLUMN "defaultPromoCode" text;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "externalProductId" text;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "productGroup" text;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "regionId" integer;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "lineId" integer;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "monthlyPriceUsd" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "checkStatus" varchar(24) DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "statusChangedAt" timestamp;--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "lockedFields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "homepage_slots" ADD CONSTRAINT "homepage_slots_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homepage_slots" ADD CONSTRAINT "homepage_slots_offerId_server_offers_id_fk" FOREIGN KEY ("offerId") REFERENCES "public"."server_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homepage_slots" ADD CONSTRAINT "homepage_slots_imageAssetId_image_assets_id_fk" FOREIGN KEY ("imageAssetId") REFERENCES "public"."image_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD CONSTRAINT "provider_monitors_providerId_aff_service_providers_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."aff_service_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_offer_checks" ADD CONSTRAINT "server_offer_checks_offerId_server_offers_id_fk" FOREIGN KEY ("offerId") REFERENCES "public"."server_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_offer_checks" ADD CONSTRAINT "server_offer_checks_monitorId_provider_monitors_id_fk" FOREIGN KEY ("monitorId") REFERENCES "public"."provider_monitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_offer_prices" ADD CONSTRAINT "server_offer_prices_offerId_server_offers_id_fk" FOREIGN KEY ("offerId") REFERENCES "public"."server_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_offer_sources" ADD CONSTRAINT "server_offer_sources_offerId_server_offers_id_fk" FOREIGN KEY ("offerId") REFERENCES "public"."server_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_offer_sources" ADD CONSTRAINT "server_offer_sources_sourcePostId_posts_id_fk" FOREIGN KEY ("sourcePostId") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_offer_tags" ADD CONSTRAINT "server_offer_tags_offerId_server_offers_id_fk" FOREIGN KEY ("offerId") REFERENCES "public"."server_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "homepage_slots_language_placement_enabled_sortOrder_idx" ON "homepage_slots" USING btree ("language","placement","enabled","sortOrder");--> statement-breakpoint
CREATE INDEX "homepage_slots_startsAt_endsAt_idx" ON "homepage_slots" USING btree ("startsAt","endsAt");--> statement-breakpoint
CREATE INDEX "homepage_slots_postId_idx" ON "homepage_slots" USING btree ("postId");--> statement-breakpoint
CREATE INDEX "homepage_slots_offerId_idx" ON "homepage_slots" USING btree ("offerId");--> statement-breakpoint
CREATE INDEX "homepage_slots_imageAssetId_idx" ON "homepage_slots" USING btree ("imageAssetId");--> statement-breakpoint
CREATE INDEX "provider_monitors_providerId_idx" ON "provider_monitors" USING btree ("providerId");--> statement-breakpoint
CREATE INDEX "provider_monitors_enabled_nextRunAt_idx" ON "provider_monitors" USING btree ("enabled","nextRunAt");--> statement-breakpoint
CREATE INDEX "server_network_lines_name_idx" ON "server_network_lines" USING btree ("name");--> statement-breakpoint
CREATE INDEX "server_network_lines_active_name_idx" ON "server_network_lines" USING btree ("active","name");--> statement-breakpoint
CREATE INDEX "server_offer_checks_offerId_checkedAt_idx" ON "server_offer_checks" USING btree ("offerId","checkedAt");--> statement-breakpoint
CREATE INDEX "server_offer_checks_monitorId_checkedAt_idx" ON "server_offer_checks" USING btree ("monitorId","checkedAt");--> statement-breakpoint
CREATE INDEX "server_offer_prices_offerId_idx" ON "server_offer_prices" USING btree ("offerId");--> statement-breakpoint
CREATE INDEX "server_offer_prices_active_monthlyPriceUsd_idx" ON "server_offer_prices" USING btree ("active","monthlyPriceUsd","offerId");--> statement-breakpoint
CREATE INDEX "server_offer_sources_offerId_idx" ON "server_offer_sources" USING btree ("offerId");--> statement-breakpoint
CREATE INDEX "server_offer_sources_sourcePostId_idx" ON "server_offer_sources" USING btree ("sourcePostId");--> statement-breakpoint
CREATE INDEX "server_offer_sources_externalId_idx" ON "server_offer_sources" USING btree ("externalId");--> statement-breakpoint
CREATE INDEX "server_offer_tags_slug_idx" ON "server_offer_tags" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "server_offer_tags_kind_slug_idx" ON "server_offer_tags" USING btree ("kind","slug");--> statement-breakpoint
CREATE INDEX "server_regions_name_idx" ON "server_regions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "server_regions_active_name_idx" ON "server_regions" USING btree ("active","name");--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_regionId_server_regions_id_fk" FOREIGN KEY ("regionId") REFERENCES "public"."server_regions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_lineId_server_network_lines_id_fk" FOREIGN KEY ("lineId") REFERENCES "public"."server_network_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aff_service_providers_slug_idx" ON "aff_service_providers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "server_offers_regionId_idx" ON "server_offers" USING btree ("regionId");--> statement-breakpoint
CREATE INDEX "server_offers_lineId_idx" ON "server_offers" USING btree ("lineId");--> statement-breakpoint
CREATE INDEX "server_offers_monthlyPriceUsd_idx" ON "server_offers" USING btree ("monthlyPriceUsd");--> statement-breakpoint
CREATE INDEX "server_offers_visible_status_monthlyPriceUsd_id_idx" ON "server_offers" USING btree ("visible","status","monthlyPriceUsd","id");--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD CONSTRAINT "aff_service_providers_slug_unique" UNIQUE("slug");

-- Backfill stable provider keys without assuming that every existing name is ASCII.
UPDATE "aff_service_providers"
SET "slug" = CASE
	WHEN trim(both '-' from lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g'))) = ''
		THEN 'provider-' || "id"::text
	ELSE trim(both '-' from lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || "id"::text
END
WHERE "slug" IS NULL;

INSERT INTO "server_regions" ("slug", "name", "enName", "aliases", "countryCode") VALUES
	('hong-kong', '香港', 'Hong Kong', '香港,HK,Hong Kong', 'HK'),
	('united-states', '美国', 'United States', '美国,US,USA,United States,洛杉矶,圣何塞,纽约,芝加哥', 'US'),
	('japan', '日本', 'Japan', '日本,JP,Japan,东京,大阪', 'JP'),
	('singapore', '新加坡', 'Singapore', '新加坡,SG,Singapore', 'SG'),
	('taiwan', '台湾', 'Taiwan', '台湾,TW,Taiwan', 'TW'),
	('south-korea', '韩国', 'South Korea', '韩国,KR,Korea,South Korea', 'KR'),
	('germany', '德国', 'Germany', '德国,DE,Germany', 'DE'),
	('united-kingdom', '英国', 'United Kingdom', '英国,UK,United Kingdom', 'GB'),
	('netherlands', '荷兰', 'Netherlands', '荷兰,NL,Netherlands', 'NL'),
	('vietnam', '越南', 'Vietnam', '越南,VN,Vietnam', 'VN')
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "server_network_lines" ("slug", "name", "enName", "aliases") VALUES
	('cn2-gia', 'CN2 GIA', 'CN2 GIA', 'CN2 GIA,CERA'),
	('cn2', 'CN2', 'CN2', 'CN2,电信CN2'),
	('cmi', 'CMI', 'CMI', 'CMI,移动CMI'),
	('bgp', 'BGP', 'BGP', 'BGP,BGP国际'),
	('as9929', 'AS9929', 'AS9929', 'AS9929,9929,联通9929'),
	('as4837', 'AS4837', 'AS4837', 'AS4837,4837,联通4837'),
	('iij', 'IIJ', 'IIJ', 'IIJ,日本IIJ'),
	('direct', '直连', 'Direct', '直连,三网直连'),
	('optimized', '回程优化', 'Optimized Route', '回程优化,大陆优化,三网优化'),
	('ddos-protected', '高防', 'DDoS Protected', '高防,防御')
ON CONFLICT ("slug") DO NOTHING;

UPDATE "server_offers" AS offers
SET "regionId" = regions."id"
FROM "server_regions" AS regions
WHERE offers."regionId" IS NULL
	AND (
		(regions."slug" = 'hong-kong' AND (offers."region" ILIKE '%香港%' OR offers."region" ~* '(^|[^A-Za-z])(HK|Hong Kong)([^A-Za-z]|$)')) OR
		(regions."slug" = 'united-states' AND (offers."region" ILIKE ANY (ARRAY['%美国%', '%洛杉矶%', '%圣何塞%', '%纽约%', '%芝加哥%']) OR offers."region" ~* '(^|[^A-Za-z])(US|USA|United States|Los Angeles|San Jose|New York|Chicago)([^A-Za-z]|$)')) OR
		(regions."slug" = 'japan' AND (offers."region" ILIKE ANY (ARRAY['%日本%', '%东京%', '%大阪%']) OR offers."region" ~* '(^|[^A-Za-z])(JP|Japan|Tokyo|Osaka)([^A-Za-z]|$)')) OR
		(regions."slug" = 'singapore' AND (offers."region" ILIKE '%新加坡%' OR offers."region" ~* '(^|[^A-Za-z])(SG|Singapore)([^A-Za-z]|$)')) OR
		(regions."slug" = 'taiwan' AND (offers."region" ILIKE '%台湾%' OR offers."region" ~* '(^|[^A-Za-z])(TW|Taiwan)([^A-Za-z]|$)')) OR
		(regions."slug" = 'south-korea' AND (offers."region" ILIKE '%韩国%' OR offers."region" ~* '(^|[^A-Za-z])(KR|Korea|South Korea)([^A-Za-z]|$)')) OR
		(regions."slug" = 'germany' AND (offers."region" ILIKE '%德国%' OR offers."region" ~* '(^|[^A-Za-z])(DE|Germany)([^A-Za-z]|$)')) OR
		(regions."slug" = 'united-kingdom' AND (offers."region" ILIKE '%英国%' OR offers."region" ~* '(^|[^A-Za-z])(UK|United Kingdom)([^A-Za-z]|$)')) OR
		(regions."slug" = 'netherlands' AND (offers."region" ILIKE '%荷兰%' OR offers."region" ~* '(^|[^A-Za-z])(NL|Netherlands)([^A-Za-z]|$)')) OR
		(regions."slug" = 'vietnam' AND (offers."region" ILIKE '%越南%' OR offers."region" ~* '(^|[^A-Za-z])(VN|Vietnam)([^A-Za-z]|$)'))
	);

UPDATE "server_offers" AS offers
SET "lineId" = lines."id"
FROM "server_network_lines" AS lines
WHERE offers."lineId" IS NULL
	AND lines."slug" = CASE
		WHEN offers."lineType" ~* 'CN2[[:space:]]*GIA|CERA' THEN 'cn2-gia'
		WHEN offers."lineType" ~* 'AS?9929|联通9929' THEN 'as9929'
		WHEN offers."lineType" ~* 'AS?4837|联通4837' THEN 'as4837'
		WHEN offers."lineType" ~* 'CMI|移动CMI' THEN 'cmi'
		WHEN offers."lineType" ~* 'CN2' THEN 'cn2'
		WHEN offers."lineType" ~* 'BGP' THEN 'bgp'
		WHEN offers."lineType" ~* 'IIJ' THEN 'iij'
		WHEN offers."lineType" ~* '高防|防御' THEN 'ddos-protected'
		WHEN offers."lineType" ~* '回程优化|大陆优化|三网优化' THEN 'optimized'
		WHEN offers."lineType" ~* '直连' THEN 'direct'
		ELSE NULL
	END;

UPDATE "server_offers"
SET "monthlyPriceUsd" = round(
		(CASE WHEN upper(coalesce("currency", 'USD')) = 'CNY' THEN "priceAmount" / 7.2 ELSE "priceAmount" END) /
		(CASE lower(coalesce("billingCycle", 'monthly'))
			WHEN 'quarterly' THEN 3
			WHEN 'semiannual' THEN 6
			WHEN 'yearly' THEN 12
			WHEN 'biennial' THEN 24
			WHEN 'triennial' THEN 36
			ELSE 1
		END),
		4
	)
WHERE "priceAmount" IS NOT NULL;

UPDATE "server_offers"
SET
	"statusChangedAt" = coalesce("statusChangedAt", "updatedAt", "createdAt"),
	"checkStatus" = CASE WHEN "lastCheckedAt" IS NULL THEN 'unknown' ELSE 'ok' END;

INSERT INTO "server_offer_prices" (
	"offerId", "billingCycle", "termMonths", "amount", "originalAmount",
	"currency", "monthlyPriceUsd", "purchaseUrl", "active", "validUntil", "createdAt", "updatedAt"
)
SELECT
	"id",
	coalesce(nullif("billingCycle", ''), 'monthly'),
	CASE lower(coalesce("billingCycle", 'monthly'))
		WHEN 'quarterly' THEN 3
		WHEN 'semiannual' THEN 6
		WHEN 'yearly' THEN 12
		WHEN 'biennial' THEN 24
		WHEN 'triennial' THEN 36
		ELSE 1
	END,
	"priceAmount",
	"originalPriceAmount",
	coalesce(nullif("currency", ''), 'USD'),
	coalesce("monthlyPriceUsd", "priceAmount"),
	"purchaseUrl",
	true,
	"validUntil",
	"createdAt",
	"updatedAt"
FROM "server_offers"
WHERE "priceAmount" IS NOT NULL
ON CONFLICT ("offerId", "billingCycle", "currency") DO NOTHING;

INSERT INTO "server_offer_sources" (
	"offerId", "sourceType", "sourcePostId", "sourceUrl", "priority", "createdAt", "updatedAt"
)
SELECT "id", 'article', "sourcePostId", "articleUrl", 10, "createdAt", "updatedAt"
FROM "server_offers"
WHERE "sourcePostId" IS NOT NULL OR "articleUrl" IS NOT NULL;

INSERT INTO "homepage_slots" (
	"language", "placement", "contentType", "postId", "sortOrder", "enabled", "trackingKey", "createdAt"
)
SELECT
	"language",
	'sidebar',
	'post',
	"postId",
	"sortOrder",
	true,
	'legacy-homepage-promoted-' || "id"::text,
	"createdAt"
FROM "homepage_promoted_posts"
ON CONFLICT ("trackingKey") DO NOTHING;
