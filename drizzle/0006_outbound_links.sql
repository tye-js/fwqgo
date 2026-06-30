CREATE TABLE "outbound_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"targetUrl" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "outbound_links_slug_unique" UNIQUE("slug"),
	CONSTRAINT "outbound_links_targetUrl_unique" UNIQUE("targetUrl")
);
--> statement-breakpoint
CREATE INDEX "outbound_links_slug_idx" ON "outbound_links" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "outbound_links_targetUrl_idx" ON "outbound_links" USING btree ("targetUrl");
