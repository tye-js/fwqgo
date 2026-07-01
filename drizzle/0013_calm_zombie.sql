CREATE TABLE IF NOT EXISTS "image_generation_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"provider" varchar(40) DEFAULT 'compatible' NOT NULL,
	"baseUrl" text NOT NULL,
	"apiKey" text,
	"model" text NOT NULL,
	"promptTemplate" text NOT NULL,
	"size" varchar(40) DEFAULT '1024x576' NOT NULL,
	"quality" varchar(40) DEFAULT 'standard' NOT NULL,
	"timeoutSeconds" integer DEFAULT 90 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "image_generation_configs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "image_generation_configs_enabled_idx" ON "image_generation_configs" USING btree ("enabled");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "image_generation_configs_isDefault_idx" ON "image_generation_configs" USING btree ("isDefault");
