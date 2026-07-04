CREATE TABLE IF NOT EXISTS "server_offer_import_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"mode" varchar(24) DEFAULT 'single' NOT NULL,
	"postId" integer,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"message" text,
	"result" text,
	"errorTitle" text,
	"errorDetail" text,
	"createdBy" text,
	"startedAt" timestamp,
	"finishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "server_offer_import_tasks" ADD CONSTRAINT "server_offer_import_tasks_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "server_offer_import_tasks" ADD CONSTRAINT "server_offer_import_tasks_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_offer_import_tasks_mode_idx" ON "server_offer_import_tasks" USING btree ("mode");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_offer_import_tasks_status_idx" ON "server_offer_import_tasks" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_offer_import_tasks_postId_idx" ON "server_offer_import_tasks" USING btree ("postId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_offer_import_tasks_status_createdAt_idx" ON "server_offer_import_tasks" USING btree ("status","createdAt");
