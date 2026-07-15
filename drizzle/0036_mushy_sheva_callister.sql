DELETE FROM "server_offer_sources"
WHERE "id" IN (
	SELECT "id"
	FROM (
		SELECT
			"id",
			row_number() OVER (
				PARTITION BY "offerId"
				ORDER BY "updatedAt" DESC NULLS LAST, "id" DESC
			) AS "duplicate_rank"
		FROM "server_offer_sources"
		WHERE "sourceType" = 'article'
	) AS "article_sources"
	WHERE "duplicate_rank" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "server_offer_sources_article_offerId_unique" ON "server_offer_sources" USING btree ("offerId") WHERE "server_offer_sources"."sourceType" = 'article';
