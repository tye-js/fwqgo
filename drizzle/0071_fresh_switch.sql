-- Partial indexes encoding `publicPostCondition` (src/server/posts/public-post-policy.ts).
--
-- The predicate is `published = true AND char_length(btrim(title)) > 0 AND
-- char_length(btrim(slug)) > 0 AND char_length(btrim(content)) >= 200`, where 200 is
-- MIN_PUBLIC_ARTICLE_CONTENT_LENGTH from @fwqgo/core/public-content-policy.
--
-- Without these, the content-length check forced a detoast pass over every candidate
-- row: the taxonomy post-count queries measured 15-32ms and the public list query
-- 17-24ms. With them the planner proves the predicate from index membership and skips
-- the detoast (measured 0.19-1.43ms).
--
-- IF NOT EXISTS keeps this migration idempotent: these indexes were first created
-- online on the production primary with CREATE INDEX CONCURRENTLY, so a plain
-- CREATE INDEX would fail there while still being needed on a fresh database.
-- Keep the predicates in sync with MIN_PUBLIC_ARTICLE_CONTENT_LENGTH; if that
-- constant changes these indexes stop matching and silently stop being used.
CREATE INDEX IF NOT EXISTS "posts_public_language_created_idx" ON "posts" USING btree ("language","createdAt","id") WHERE "posts"."published" = true and char_length(btrim("posts"."title")) > 0 and char_length(btrim("posts"."slug")) > 0 and char_length(btrim("posts"."content")) >= 200;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_public_category_idx" ON "posts" USING btree ("categoryId") WHERE "posts"."published" = true AND char_length(btrim("posts"."title")) > 0 AND char_length(btrim("posts"."slug")) > 0 AND char_length(btrim("posts"."content")) >= 200;
