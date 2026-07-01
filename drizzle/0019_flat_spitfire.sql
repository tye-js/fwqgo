ALTER TABLE "posts" ADD COLUMN "enTitle" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "enSlug" varchar(320);--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "enContent" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "enKeywords" varchar(800);--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "enDescription" varchar(800);--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "enImgUrl" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "enUpdatedAt" timestamp;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_enSlug_unique" UNIQUE("enSlug");