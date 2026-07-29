ALTER TABLE "knowledge_articles" ADD COLUMN "definition" text;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD COLUMN "highlights" jsonb;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD COLUMN "quickTip" text;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_highlights_check" CHECK ("knowledge_articles"."highlights" is null or (jsonb_typeof("knowledge_articles"."highlights") = 'array' and jsonb_array_length("knowledge_articles"."highlights") between 2 and 3));