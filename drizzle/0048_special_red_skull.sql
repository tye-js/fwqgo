CREATE TABLE "ai_rewrite_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"taskId" integer NOT NULL,
	"taskAttempt" integer DEFAULT 1 NOT NULL,
	"stage" varchar(48) NOT NULL,
	"stageName" text NOT NULL,
	"stageAttempt" integer DEFAULT 1 NOT NULL,
	"status" varchar(24) DEFAULT 'running' NOT NULL,
	"configSnapshot" text,
	"model" text,
	"maxTokens" integer,
	"temperature" integer,
	"prompt" text,
	"promptLength" integer,
	"promptTruncated" boolean DEFAULT false NOT NULL,
	"response" text,
	"responseLength" integer,
	"responseTruncated" boolean DEFAULT false NOT NULL,
	"readableContent" text,
	"readableContentLength" integer,
	"readableContentTruncated" boolean DEFAULT false NOT NULL,
	"metadata" text,
	"finishReason" varchar(40),
	"promptTokens" integer,
	"completionTokens" integer,
	"totalTokens" integer,
	"error" text,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"finishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "ai_rewrite_artifacts_task_stage_unique" UNIQUE("taskId","taskAttempt","stage","stageAttempt"),
	CONSTRAINT "ai_rewrite_artifacts_status_check" CHECK ("ai_rewrite_artifacts"."status" in ('running', 'success', 'retry', 'failed')),
	CONSTRAINT "ai_rewrite_artifacts_task_attempt_check" CHECK ("ai_rewrite_artifacts"."taskAttempt" >= 1),
	CONSTRAINT "ai_rewrite_artifacts_stage_attempt_check" CHECK ("ai_rewrite_artifacts"."stageAttempt" >= 1)
);
--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" ADD COLUMN "factExtractionPrompt" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" ADD COLUMN "initialRewritePrompt" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" ADD COLUMN "rewriteRetryPrompt" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" ADD COLUMN "qualityReviewPrompt" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" ADD COLUMN "englishContentPrompt" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" ADD COLUMN "englishContinuationPrompt" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_configs" ADD COLUMN "englishMetadataPrompt" text;--> statement-breakpoint
ALTER TABLE "ai_rewrite_artifacts" ADD CONSTRAINT "ai_rewrite_artifacts_taskId_ai_rewrite_tasks_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."ai_rewrite_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_rewrite_artifacts_taskId_idx" ON "ai_rewrite_artifacts" USING btree ("taskId");--> statement-breakpoint
CREATE INDEX "ai_rewrite_artifacts_task_attempt_stage_idx" ON "ai_rewrite_artifacts" USING btree ("taskId","taskAttempt","stage","stageAttempt");