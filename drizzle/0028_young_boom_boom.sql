CREATE TABLE "site_seo_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"language" varchar(8) NOT NULL,
	"siteName" text NOT NULL,
	"title" text NOT NULL,
	"description" varchar(800),
	"keywords" varchar(800),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "site_seo_configs_language_unique" UNIQUE("language")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "enName" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "enSlug" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "enDescription" varchar(800);--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "enKeywords" varchar(800);--> statement-breakpoint
ALTER TABLE "homepage_promoted_posts" ADD COLUMN "language" varchar(8) DEFAULT 'zh' NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "enName" text;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "enKeywords" varchar(800);--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "enDescription" varchar(800);--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "enSlug" text;--> statement-breakpoint
CREATE INDEX "site_seo_configs_language_idx" ON "site_seo_configs" USING btree ("language");--> statement-breakpoint
CREATE INDEX "homepage_promoted_posts_language_idx" ON "homepage_promoted_posts" USING btree ("language");--> statement-breakpoint
CREATE INDEX "homepage_promoted_posts_language_sortOrder_createdAt_idx" ON "homepage_promoted_posts" USING btree ("language","sortOrder","createdAt");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_enSlug_unique" UNIQUE("enSlug");--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_enSlug_unique" UNIQUE("enSlug");