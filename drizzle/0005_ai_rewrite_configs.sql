CREATE TABLE "ai_rewrite_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"provider" varchar(40) NOT NULL,
	"baseUrl" text NOT NULL,
	"apiKey" text,
	"model" text NOT NULL,
	"styleName" text NOT NULL,
	"stylePrompt" text NOT NULL,
	"temperature" integer DEFAULT 40 NOT NULL,
	"maxTokens" integer DEFAULT 8192 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "ai_rewrite_configs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX "ai_rewrite_configs_provider_idx" ON "ai_rewrite_configs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "ai_rewrite_configs_enabled_idx" ON "ai_rewrite_configs" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "ai_rewrite_configs_isDefault_idx" ON "ai_rewrite_configs" USING btree ("isDefault");--> statement-breakpoint
INSERT INTO "ai_rewrite_configs" (
	"name",
	"provider",
	"baseUrl",
	"model",
	"styleName",
	"stylePrompt",
	"enabled",
	"isDefault"
) VALUES (
	'DeepSeek 官方',
	'deepseek',
	'https://api.deepseek.com',
	'deepseek-chat',
	'服务器推广专业评测',
	'保持服务器/VPS推广文章的专业评测风格，强化商家特点、配置、线路、价格、优惠码、适用场景和SEO长尾词。保留原文中的表格、价格、配置、优惠码、官网链接和返利链接，不要编造不存在的信息。',
	false,
	true
);
