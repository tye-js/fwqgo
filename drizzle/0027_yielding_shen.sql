ALTER TABLE "image_generation_configs" ALTER COLUMN "timeoutSeconds" SET DEFAULT 180;--> statement-breakpoint
UPDATE "image_generation_configs" SET "timeoutSeconds" = 180, "updatedAt" = now() WHERE "timeoutSeconds" = 90;
