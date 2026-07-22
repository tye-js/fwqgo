CREATE TABLE "knowledge_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"categoryId" integer NOT NULL,
	"title" text NOT NULL,
	"slug" varchar(320) NOT NULL,
	"summary" varchar(1200),
	"content" text NOT NULL,
	"keywords" text,
	"aliases" text,
	"retrievalTerms" text,
	"sourceNotes" text,
	"published" boolean DEFAULT false NOT NULL,
	"allowAiReference" boolean DEFAULT true NOT NULL,
	"publishedAt" timestamp,
	"createdBy" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "knowledge_articles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "knowledge_articles_content_check" CHECK (length(btrim("knowledge_articles"."content")) > 0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(160) NOT NULL,
	"description" varchar(800),
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "knowledge_categories_name_unique" UNIQUE("name"),
	CONSTRAINT "knowledge_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
INSERT INTO "knowledge_categories" ("name", "slug", "description", "sortOrder") VALUES
	('服务器配置', 'server-configuration', 'CPU、内存、硬盘、虚拟化、带宽和流量等配置知识。', 10),
	('网络线路', 'network-routes', 'CN2 GIA、CMI、CUII、BGP、IPLC、IEPL 和国际运营商线路知识。', 20),
	('机房与地区', 'datacenter-regions', '服务器地区、数据中心、网络延迟和访问方向等基础知识。', 30),
	('IP 与网络', 'ip-network', 'IPv4、IPv6、原生 IP、广播 IP、ASN、路由和 DNS 知识。', 40),
	('系统与运维', 'system-operations', 'Linux、Windows、建站、监控、备份和日常运维知识。', 50),
	('安全与应用', 'security-use-cases', 'DDoS 防护、防火墙、业务场景、合规边界和选购注意事项。', 60)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_categoryId_knowledge_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."knowledge_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_articles_categoryId_idx" ON "knowledge_articles" USING btree ("categoryId");--> statement-breakpoint
CREATE INDEX "knowledge_articles_published_category_updatedAt_idx" ON "knowledge_articles" USING btree ("published","categoryId","updatedAt");--> statement-breakpoint
CREATE INDEX "knowledge_articles_aiReference_idx" ON "knowledge_articles" USING btree ("published","allowAiReference");--> statement-breakpoint
CREATE INDEX "knowledge_articles_createdBy_idx" ON "knowledge_articles" USING btree ("createdBy");--> statement-breakpoint
CREATE INDEX "knowledge_articles_title_idx" ON "knowledge_articles" USING btree ("title");--> statement-breakpoint
CREATE INDEX "knowledge_categories_sortOrder_id_idx" ON "knowledge_categories" USING btree ("sortOrder","id");--> statement-breakpoint
UPDATE "ai_rewrite_configs"
SET "basePrompt" = NULL
WHERE md5("basePrompt") = '5d003f8f5e6a71df0f4d8239323d2356';--> statement-breakpoint
UPDATE "ai_rewrite_configs"
SET "metadataPrompt" = NULL
WHERE md5("metadataPrompt") = '6dfb96c8d7ae0a8a4544998f20698799';
