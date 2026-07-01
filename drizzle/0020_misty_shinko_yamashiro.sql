CREATE TABLE IF NOT EXISTS "ai_task_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"taskId" integer NOT NULL,
	"stepKey" varchar(64) NOT NULL,
	"stepName" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"message" text,
	"error" text,
	"payload" text,
	"startedAt" timestamp,
	"finishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "ai_task_steps_task_step_attempt_unique" UNIQUE("taskId","stepKey","attempt")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"materialType" varchar(24) DEFAULT 'url' NOT NULL,
	"sourceUrl" text,
	"title" text,
	"content" text,
	"fileName" text,
	"mime" varchar(120),
	"size" bigint,
	"categoryId" integer NOT NULL,
	"rewriteStyleId" integer,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"metadata" text,
	"createdBy" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_task_steps" ADD CONSTRAINT "ai_task_steps_task_step_attempt_unique" UNIQUE("taskId","stepKey","attempt");
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "ai_rewrite_tasks" ADD COLUMN IF NOT EXISTS "sourceMaterialId" integer;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_task_steps" ADD CONSTRAINT "ai_task_steps_taskId_ai_rewrite_tasks_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."ai_rewrite_tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "source_materials" ADD CONSTRAINT "source_materials_categoryId_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "source_materials" ADD CONSTRAINT "source_materials_rewriteStyleId_ai_rewrite_configs_id_fk" FOREIGN KEY ("rewriteStyleId") REFERENCES "public"."ai_rewrite_configs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "source_materials" ADD CONSTRAINT "source_materials_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_task_steps_taskId_idx" ON "ai_task_steps" USING btree ("taskId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_task_steps_status_idx" ON "ai_task_steps" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_materials_materialType_idx" ON "source_materials" USING btree ("materialType");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_materials_sourceUrl_idx" ON "source_materials" USING btree ("sourceUrl");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_materials_status_idx" ON "source_materials" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_materials_createdAt_idx" ON "source_materials" USING btree ("createdAt");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ai_rewrite_tasks" ADD CONSTRAINT "ai_rewrite_tasks_sourceMaterialId_source_materials_id_fk" FOREIGN KEY ("sourceMaterialId") REFERENCES "public"."source_materials"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_rewrite_tasks_sourceMaterialId_idx" ON "ai_rewrite_tasks" USING btree ("sourceMaterialId");
