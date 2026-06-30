CREATE TABLE "ai_source_sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"siteUrl" text NOT NULL,
	"feedUrl" text,
	"categoryId" integer NOT NULL,
	"rewriteStyleId" integer,
	"limit" integer DEFAULT 10 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"lastRunAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "ai_source_sites_siteUrl_unique" UNIQUE("siteUrl")
);
--> statement-breakpoint
CREATE INDEX "ai_source_sites_enabled_idx" ON "ai_source_sites" USING btree ("enabled");--> statement-breakpoint
ALTER TABLE "ai_source_sites" ADD CONSTRAINT "ai_source_sites_categoryId_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_source_sites" ADD CONSTRAINT "ai_source_sites_rewriteStyleId_ai_rewrite_configs_id_fk" FOREIGN KEY ("rewriteStyleId") REFERENCES "public"."ai_rewrite_configs"("id") ON DELETE set null ON UPDATE no action;
