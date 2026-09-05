CREATE TABLE "public_slug_redirects" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"language" varchar(8) NOT NULL,
	"oldSlug" text NOT NULL,
	"newSlug" text NOT NULL,
	"postId" integer,
	"categoryId" integer,
	"tagId" integer,
	"changedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "public_slug_redirects_language_check" CHECK ("public_slug_redirects"."language" in ('zh', 'en')),
	CONSTRAINT "public_slug_redirects_target_check" CHECK (
      ("public_slug_redirects"."kind" = 'post' and "public_slug_redirects"."postId" is not null and "public_slug_redirects"."categoryId" is null and "public_slug_redirects"."tagId" is null)
      or ("public_slug_redirects"."kind" = 'category' and "public_slug_redirects"."categoryId" is not null and "public_slug_redirects"."postId" is null and "public_slug_redirects"."tagId" is null)
      or ("public_slug_redirects"."kind" = 'tag' and "public_slug_redirects"."tagId" is not null and "public_slug_redirects"."postId" is null and "public_slug_redirects"."categoryId" is null)
    )
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "slugLocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "public_slug_redirects" ADD CONSTRAINT "public_slug_redirects_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_slug_redirects" ADD CONSTRAINT "public_slug_redirects_categoryId_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_slug_redirects" ADD CONSTRAINT "public_slug_redirects_tagId_tags_id_fk" FOREIGN KEY ("tagId") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "public_slug_redirects_kind_language_oldSlug_unique" ON "public_slug_redirects" USING btree ("kind","language","oldSlug");--> statement-breakpoint
CREATE INDEX "public_slug_redirects_postId_idx" ON "public_slug_redirects" USING btree ("postId");--> statement-breakpoint
CREATE INDEX "public_slug_redirects_categoryId_idx" ON "public_slug_redirects" USING btree ("categoryId");--> statement-breakpoint
CREATE INDEX "public_slug_redirects_tagId_idx" ON "public_slug_redirects" USING btree ("tagId");
--> statement-breakpoint
UPDATE "posts" SET "slugLocked" = true WHERE "published" = true;
--> statement-breakpoint
CREATE FUNCTION "fwqgo_track_public_slug"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  entity_kind text := TG_ARGV[0];
  lang text;
  old_slug text;
  new_slug text;
  previous jsonb;
  current_row jsonb;
  target_id integer := NEW.id;
  alias_owner integer;
  collision boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN previous := to_jsonb(OLD); END IF;

  IF entity_kind = 'post' THEN
    NEW."slugLocked" := NEW.published OR coalesce((previous->>'slugLocked')::boolean, false)
      OR coalesce((previous->>'published')::boolean, false);
    IF TG_OP = 'UPDATE' AND (OLD."slugLocked" OR OLD.published) AND OLD.language IS DISTINCT FROM NEW.language THEN
      RAISE EXCEPTION '已发布文章不能修改语言，请创建独立译文' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (OLD."slugLocked" OR OLD.published)
      AND (OLD.slug IS DISTINCT FROM NEW.slug OR OLD.language IS DISTINCT FROM NEW.language)
      AND coalesce(current_setting('fwqgo.allow_slug_change', true), '') <> 'on' THEN
      RAISE EXCEPTION '已发布文章的 slug 已锁定，请明确启用修改地址' USING ERRCODE = '23514';
    END IF;
    -- Validate new publication and edits, without changing historical rows as
    -- a side effect of an unrelated migration or metadata update.
    IF NEW.published AND (TG_OP = 'INSERT' OR NOT coalesce((previous->>'published')::boolean, false)
      OR previous->>'content' IS DISTINCT FROM NEW.content
      OR previous->>'title' IS DISTINCT FROM NEW.title) THEN
      IF char_length(btrim(NEW.title)) = 0 OR char_length(btrim(NEW.slug)) = 0
        OR char_length(btrim(NEW.content)) < 200 THEN
        RAISE EXCEPTION '发布前需填写标题、slug，且正文至少 200 个字符' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  current_row := to_jsonb(NEW);

  FOREACH lang IN ARRAY (CASE WHEN entity_kind = 'post' THEN ARRAY[current_row->>'language'] ELSE ARRAY['zh', 'en'] END) LOOP
    new_slug := CASE WHEN lang = 'en' AND entity_kind <> 'post'
      THEN coalesce(nullif(btrim(current_row->>'enSlug'), ''), current_row->>'slug')
      ELSE current_row->>'slug' END;
    old_slug := CASE WHEN lang = 'en' AND entity_kind <> 'post'
      THEN coalesce(nullif(btrim(previous->>'enSlug'), ''), previous->>'slug')
      ELSE previous->>'slug' END;
    IF TG_OP = 'UPDATE' AND old_slug IS NOT DISTINCT FROM new_slug THEN CONTINUE; END IF;

    -- Serialize reservations in a namespace so concurrent edits cannot steal
    -- a historical address. Redirects remain attached to their original ID.
    PERFORM pg_advisory_xact_lock(hashtext('fwqgo_slug:' || entity_kind || ':' || lang), hashtext(new_slug));
    SELECT coalesce("postId", "categoryId", "tagId") INTO alias_owner
      FROM "public_slug_redirects"
      WHERE kind = entity_kind AND language = lang AND "oldSlug" = new_slug;
    IF alias_owner IS NOT NULL AND alias_owner <> target_id THEN
      RAISE EXCEPTION 'slug 已被历史地址占用: %', new_slug USING ERRCODE = '23505';
    END IF;

    IF entity_kind <> 'post' AND lang = 'en' THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE id <> $1 AND coalesce(nullif(btrim("enSlug"), ''''), slug) = $2)', TG_TABLE_NAME)
        INTO collision USING target_id, new_slug;
      IF collision THEN RAISE EXCEPTION '英文 slug 与现有规范地址冲突: %', new_slug USING ERRCODE = '23505'; END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND old_slug IS NOT NULL AND old_slug <> new_slug
      AND (entity_kind <> 'post' OR coalesce((previous->>'slugLocked')::boolean, false) OR coalesce((previous->>'published')::boolean, false)) THEN
      PERFORM pg_advisory_xact_lock(hashtext('fwqgo_slug:' || entity_kind || ':' || lang), hashtext(old_slug));
      INSERT INTO "public_slug_redirects" (kind, language, "oldSlug", "newSlug", "postId", "categoryId", "tagId")
        VALUES (entity_kind, lang, old_slug, new_slug,
          CASE WHEN entity_kind = 'post' THEN target_id END,
          CASE WHEN entity_kind = 'category' THEN target_id END,
          CASE WHEN entity_kind = 'tag' THEN target_id END)
        ON CONFLICT (kind, language, "oldSlug") DO UPDATE
          SET "newSlug" = EXCLUDED."newSlug", "changedAt" = now()
          WHERE coalesce("public_slug_redirects"."postId", "public_slug_redirects"."categoryId", "public_slug_redirects"."tagId") = target_id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "fwqgo_track_public_slug"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "posts_public_slug_history" BEFORE INSERT OR UPDATE OF "slug", "language", "published", "title", "content", "slugLocked" ON "posts"
FOR EACH ROW EXECUTE FUNCTION "fwqgo_track_public_slug"('post');
--> statement-breakpoint
CREATE TRIGGER "categories_public_slug_history" BEFORE INSERT OR UPDATE OF "slug", "enSlug" ON "categories"
FOR EACH ROW EXECUTE FUNCTION "fwqgo_track_public_slug"('category');
--> statement-breakpoint
CREATE TRIGGER "tags_public_slug_history" BEFORE INSERT OR UPDATE OF "slug", "enSlug" ON "tags"
FOR EACH ROW EXECUTE FUNCTION "fwqgo_track_public_slug"('tag');
--> statement-breakpoint
-- Preserve access for the existing read-only web role without granting any
-- write privileges. The trigger writes history with its owner's privileges.
DO $$
DECLARE reader record;
BEGIN
  FOR reader IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'posts' AND privilege_type = 'SELECT'
  LOOP
    IF reader.grantee = 'PUBLIC' THEN
      GRANT SELECT ON "public"."public_slug_redirects" TO PUBLIC;
    ELSE
      EXECUTE format('GRANT SELECT ON "public"."public_slug_redirects" TO %I', reader.grantee);
    END IF;
  END LOOP;
END;
$$;
