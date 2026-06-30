CREATE TABLE "ai_rewrite_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceUrl" text NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"currentStep" text,
	"error" text,
	"categoryId" integer NOT NULL,
	"rewriteStyleId" integer,
	"postId" integer,
	"resultTitle" text,
	"diagnostics" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"startedAt" timestamp,
	"finishedAt" timestamp
);
--> statement-breakpoint
CREATE INDEX "ai_rewrite_tasks_status_idx" ON "ai_rewrite_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_rewrite_tasks_createdAt_idx" ON "ai_rewrite_tasks" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "ai_rewrite_tasks_postId_idx" ON "ai_rewrite_tasks" USING btree ("postId");--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD CONSTRAINT "ai_rewrite_tasks_categoryId_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD CONSTRAINT "ai_rewrite_tasks_rewriteStyleId_ai_rewrite_configs_id_fk" FOREIGN KEY ("rewriteStyleId") REFERENCES "public"."ai_rewrite_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD CONSTRAINT "ai_rewrite_tasks_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
