ALTER TABLE "homepage_slots" DROP CONSTRAINT "homepage_slots_imageAssetId_image_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "homepage_slots" ADD CONSTRAINT "homepage_slots_imageAssetId_image_assets_id_fk" FOREIGN KEY ("imageAssetId") REFERENCES "public"."image_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "server_offers_providerId_externalProductId_unique" ON "server_offers" USING btree ("providerId","externalProductId") WHERE "server_offers"."providerId" is not null and "server_offers"."externalProductId" is not null;--> statement-breakpoint
ALTER TABLE "server_offer_sources" ADD CONSTRAINT "server_offer_sources_offerId_sourceType_externalId_unique" UNIQUE("offerId","sourceType","externalId");--> statement-breakpoint
ALTER TABLE "homepage_slots" ADD CONSTRAINT "homepage_slots_language_check" CHECK ("homepage_slots"."language" in ('zh', 'en'));--> statement-breakpoint
ALTER TABLE "homepage_slots" ADD CONSTRAINT "homepage_slots_placement_check" CHECK ("homepage_slots"."placement" in ('hero_primary', 'promo_grid', 'featured_offers', 'sidebar'));--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD CONSTRAINT "provider_monitors_adapter_check" CHECK ("provider_monitors"."adapter" in ('json'));--> statement-breakpoint
ALTER TABLE "provider_monitors" ADD CONSTRAINT "provider_monitors_lastStatus_check" CHECK ("provider_monitors"."lastStatus" in ('idle', 'running', 'succeeded', 'failed'));--> statement-breakpoint
ALTER TABLE "server_offer_checks" ADD CONSTRAINT "server_offer_checks_responseTimeMs_check" CHECK ("server_offer_checks"."responseTimeMs" is null or "server_offer_checks"."responseTimeMs" >= 0);--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_status_check" CHECK ("server_offers"."status" in ('in_stock', 'out_of_stock', 'restocking', 'discontinued', 'preorder'));--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_checkStatus_check" CHECK ("server_offers"."checkStatus" in ('ok', 'failed', 'unknown'));--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_lockedFields_check" CHECK (jsonb_typeof("server_offers"."lockedFields") = 'array');
--> statement-breakpoint
DO $$
BEGIN
	BEGIN
		CREATE EXTENSION IF NOT EXISTS pg_trgm;
	EXCEPTION
		WHEN insufficient_privilege OR undefined_file THEN
			RAISE NOTICE 'pg_trgm is unavailable; inventory text search will use the regular fallback';
	END;

	IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
		CREATE INDEX IF NOT EXISTS "server_offers_inventory_search_trgm_idx"
			ON "server_offers" USING gin ((
				coalesce("title", '') || ' ' ||
				coalesce("externalProductId", '') || ' ' ||
				coalesce("providerName", '') || ' ' ||
				coalesce("productGroup", '') || ' ' ||
				coalesce("region", '') || ' ' ||
				coalesce("lineType", '') || ' ' ||
				coalesce("cpu", '') || ' ' ||
				coalesce("memory", '') || ' ' ||
				coalesce("storage", '') || ' ' ||
				coalesce("bandwidth", '') || ' ' ||
				coalesce("traffic", '') || ' ' ||
				coalesce("promoCode", '')
			) gin_trgm_ops);
	END IF;
END $$;
