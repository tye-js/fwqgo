ALTER TABLE "knowledge_articles" ALTER COLUMN "allowAiReference" SET DEFAULT false;--> statement-breakpoint
UPDATE "knowledge_articles"
SET "allowAiReference" = false
WHERE "published" = false
  AND "allowAiReference" = true;
