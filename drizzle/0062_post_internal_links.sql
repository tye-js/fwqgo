CREATE TABLE "post_internal_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourcePostId" integer NOT NULL,
	"targetType" varchar(24) NOT NULL,
	"targetKey" varchar(400) NOT NULL,
	"targetPostId" integer,
	"targetKnowledgeArticleId" integer,
	"targetCategoryId" integer,
	"targetTagId" integer,
	"targetPath" text,
	"language" varchar(8) NOT NULL,
	"placement" varchar(32) NOT NULL,
	"anchorText" text,
	"sourceExcerpt" text,
	"sectionHeading" text,
	"occurrenceIndex" integer DEFAULT 0 NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"generatedBy" varchar(16) DEFAULT 'rule' NOT NULL,
	"status" varchar(16) DEFAULT 'suggested' NOT NULL,
	"sourceContentHash" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "post_internal_links_targetType_check" CHECK ("post_internal_links"."targetType" in ('post', 'knowledge', 'category', 'tag', 'tool', 'server_topic')),
	CONSTRAINT "post_internal_links_placement_check" CHECK ("post_internal_links"."placement" in ('inline', 'related_knowledge', 'related_post', 'next_step')),
	CONSTRAINT "post_internal_links_language_check" CHECK ("post_internal_links"."language" in ('zh', 'en')),
	CONSTRAINT "post_internal_links_generatedBy_check" CHECK ("post_internal_links"."generatedBy" in ('rule', 'ai', 'manual')),
	CONSTRAINT "post_internal_links_status_check" CHECK ("post_internal_links"."status" in ('suggested', 'approved', 'active', 'rejected', 'stale')),
	CONSTRAINT "post_internal_links_score_check" CHECK ("post_internal_links"."score" between 0 and 100),
	CONSTRAINT "post_internal_links_occurrenceIndex_check" CHECK ("post_internal_links"."occurrenceIndex" >= 0),
	CONSTRAINT "post_internal_links_target_shape_check" CHECK ((
        ("post_internal_links"."targetType" = 'post' and "post_internal_links"."targetPostId" is not null and "post_internal_links"."targetKnowledgeArticleId" is null and "post_internal_links"."targetCategoryId" is null and "post_internal_links"."targetTagId" is null and "post_internal_links"."targetPath" is null)
        or ("post_internal_links"."targetType" = 'knowledge' and "post_internal_links"."targetPostId" is null and "post_internal_links"."targetKnowledgeArticleId" is not null and "post_internal_links"."targetCategoryId" is null and "post_internal_links"."targetTagId" is null and "post_internal_links"."targetPath" is null)
        or ("post_internal_links"."targetType" = 'category' and "post_internal_links"."targetPostId" is null and "post_internal_links"."targetKnowledgeArticleId" is null and "post_internal_links"."targetCategoryId" is not null and "post_internal_links"."targetTagId" is null and "post_internal_links"."targetPath" is null)
        or ("post_internal_links"."targetType" = 'tag' and "post_internal_links"."targetPostId" is null and "post_internal_links"."targetKnowledgeArticleId" is null and "post_internal_links"."targetCategoryId" is null and "post_internal_links"."targetTagId" is not null and "post_internal_links"."targetPath" is null)
        or ("post_internal_links"."targetType" in ('tool', 'server_topic') and "post_internal_links"."targetPostId" is null and "post_internal_links"."targetKnowledgeArticleId" is null and "post_internal_links"."targetCategoryId" is null and "post_internal_links"."targetTagId" is null and length(trim("post_internal_links"."targetPath")) > 0)
      )),
	CONSTRAINT "post_internal_links_no_self_post_link_check" CHECK ("post_internal_links"."targetPostId" is null or "post_internal_links"."targetPostId" <> "post_internal_links"."sourcePostId")
);
--> statement-breakpoint
ALTER TABLE "post_internal_links" ADD CONSTRAINT "post_internal_links_sourcePostId_posts_id_fk" FOREIGN KEY ("sourcePostId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_internal_links" ADD CONSTRAINT "post_internal_links_targetPostId_posts_id_fk" FOREIGN KEY ("targetPostId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_internal_links" ADD CONSTRAINT "post_internal_links_targetKnowledgeArticleId_knowledge_articles_id_fk" FOREIGN KEY ("targetKnowledgeArticleId") REFERENCES "public"."knowledge_articles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_internal_links" ADD CONSTRAINT "post_internal_links_targetCategoryId_categories_id_fk" FOREIGN KEY ("targetCategoryId") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_internal_links" ADD CONSTRAINT "post_internal_links_targetTagId_tags_id_fk" FOREIGN KEY ("targetTagId") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "post_internal_links_source_target_placement_uidx" ON "post_internal_links" USING btree ("sourcePostId","targetKey","placement");
--> statement-breakpoint
CREATE INDEX "post_internal_links_source_status_placement_idx" ON "post_internal_links" USING btree ("sourcePostId","status","placement");
--> statement-breakpoint
CREATE INDEX "post_internal_links_targetPostId_idx" ON "post_internal_links" USING btree ("targetPostId");
--> statement-breakpoint
CREATE INDEX "post_internal_links_targetKnowledgeArticleId_idx" ON "post_internal_links" USING btree ("targetKnowledgeArticleId");
