UPDATE "categories" SET "parentId" = NULL WHERE "parentId" = 0;
--> statement-breakpoint
UPDATE "categories"
SET "parentId" = NULL
WHERE "parentId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "categories" AS "parent"
    WHERE "parent"."id" = "categories"."parentId"
  );
--> statement-breakpoint
INSERT INTO "categories" ("name", "slug", "description", "keywords")
SELECT '未分类', 'uncategorized', '自动迁移生成的兜底分类', '未分类'
WHERE EXISTS (
  SELECT 1 FROM "posts"
  WHERE NOT EXISTS (
    SELECT 1 FROM "categories" WHERE "categories"."id" = "posts"."categoryId"
  )
)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "posts"
SET "categoryId" = COALESCE(
  (SELECT "id" FROM "categories" WHERE "slug" = 'uncategorized' LIMIT 1),
  (SELECT "id" FROM "categories" WHERE "name" = '未分类' LIMIT 1)
)
WHERE NOT EXISTS (
  SELECT 1 FROM "categories" WHERE "categories"."id" = "posts"."categoryId"
);
--> statement-breakpoint
UPDATE "posts"
SET "authorId" = NULL
WHERE "authorId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "users" WHERE "users"."id" = "posts"."authorId"
  );
--> statement-breakpoint
UPDATE "posts"
SET "recommendedTagName" = NULL
WHERE "recommendedTagName" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "tags" WHERE "tags"."name" = "posts"."recommendedTagName"
  );
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "recommendedTagId" integer;
--> statement-breakpoint
UPDATE "posts"
SET "recommendedTagId" = "tags"."id"
FROM "tags"
WHERE "posts"."recommendedTagName" = "tags"."name";
--> statement-breakpoint
DELETE FROM "post_tags"
WHERE NOT EXISTS (
  SELECT 1 FROM "posts" WHERE "posts"."id" = "post_tags"."postId"
)
OR NOT EXISTS (
  SELECT 1 FROM "tags" WHERE "tags"."id" = "post_tags"."tagId"
);
--> statement-breakpoint
DELETE FROM "homepage_promoted_posts"
WHERE NOT EXISTS (
  SELECT 1 FROM "posts" WHERE "posts"."id" = "homepage_promoted_posts"."postId"
);
--> statement-breakpoint
DELETE FROM "sessions"
WHERE NOT EXISTS (
  SELECT 1 FROM "users" WHERE "users"."id" = "sessions"."userId"
);
--> statement-breakpoint
DELETE FROM "accounts"
WHERE NOT EXISTS (
  SELECT 1 FROM "users" WHERE "users"."id" = "accounts"."userId"
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_categories_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_categoryId_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_users_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_recommendedTagId_tags_id_fk" FOREIGN KEY ("recommendedTagId") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "posts_recommendedTagId_idx" ON "posts" USING btree ("recommendedTagId");
--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tagId_tags_id_fk" FOREIGN KEY ("tagId") REFERENCES "public"."tags"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "homepage_promoted_posts" ADD CONSTRAINT "homepage_promoted_posts_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
