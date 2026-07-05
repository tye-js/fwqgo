CREATE TABLE IF NOT EXISTS "admin_background_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"jobKey" varchar(180) NOT NULL,
	"label" text NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"payload" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"maxAttempts" integer DEFAULT 3 NOT NULL,
	"runAfter" timestamp DEFAULT now() NOT NULL,
	"lockedBy" text,
	"lockedAt" timestamp,
	"heartbeatAt" timestamp,
	"lastError" text,
	"startedAt" timestamp,
	"finishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp
);
--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS "admin_background_jobs_jobKey_idx" ON "admin_background_jobs" USING btree ("jobKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_background_jobs_status_runAfter_idx" ON "admin_background_jobs" USING btree ("status","runAfter");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_background_jobs_lockedAt_idx" ON "admin_background_jobs" USING btree ("lockedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_background_jobs_heartbeatAt_idx" ON "admin_background_jobs" USING btree ("heartbeatAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_background_jobs_status_createdAt_idx" ON "admin_background_jobs" USING btree ("status","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_background_jobs_queued_jobKey_unique" ON "admin_background_jobs" USING btree ("jobKey") WHERE "admin_background_jobs"."status" = 'queued';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_offer_import_tasks_mode_idx" ON "server_offer_import_tasks" USING btree ("mode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_offer_import_tasks_status_idx" ON "server_offer_import_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_offer_import_tasks_postId_idx" ON "server_offer_import_tasks" USING btree ("postId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_offer_import_tasks_status_createdAt_idx" ON "server_offer_import_tasks" USING btree ("status","createdAt");
