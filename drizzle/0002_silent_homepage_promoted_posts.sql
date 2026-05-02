CREATE TABLE "homepage_promoted_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"postId" integer NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "homepage_promoted_posts_postId_unique" UNIQUE("postId")
);
--> statement-breakpoint
CREATE INDEX "homepage_promoted_posts_postId_idx" ON "homepage_promoted_posts" USING btree ("postId");
--> statement-breakpoint
CREATE INDEX "homepage_promoted_posts_sortOrder_idx" ON "homepage_promoted_posts" USING btree ("sortOrder");
