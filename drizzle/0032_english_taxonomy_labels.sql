UPDATE "categories" AS category
SET
  "enName" = COALESCE(NULLIF(BTRIM(category."enName"), ''), labels."enName"),
  "enSlug" = COALESCE(NULLIF(BTRIM(category."enSlug"), ''), labels."enSlug"),
  "updatedAt" = NOW()
FROM (
  VALUES
    ('vps', 'International VPS', 'international-vps'),
    ('fuwuqi', 'China Servers', 'china-servers'),
    ('zztj', 'Editor''s Picks', 'editors-picks'),
    ('ddos-vps', 'DDoS-Protected Servers', 'ddos-protected-servers'),
    ('export-vps', 'Global Business Servers', 'global-business-servers'),
    ('isp-vps', 'Residential IP Servers', 'residential-ip-servers'),
    ('cheap-vps', 'Cheap VPS', 'cheap-vps'),
    ('usa-vps', 'US VPS', 'us-vps'),
    ('jp-vps', 'Japan VPS', 'japan-vps'),
    ('kr-vps', 'Korea VPS', 'korea-vps'),
    ('hk-vps', 'Hong Kong VPS', 'hong-kong-vps'),
    ('unlimited-traffic-vps', 'Unlimited Bandwidth Servers', 'unlimited-bandwidth-servers'),
    ('large-bandwidth-vps', 'High-Bandwidth Servers', 'high-bandwidth-servers'),
    ('free-vps', 'Free VPS', 'free-vps')
) AS labels("slug", "enName", "enSlug")
WHERE category."slug" = labels."slug";

SELECT SETVAL(
  PG_GET_SERIAL_SEQUENCE('tags', 'id'),
  COALESCE((SELECT MAX("id") FROM "tags"), 1),
  EXISTS(SELECT 1 FROM "tags")
);

WITH english_keyword_tags AS (
  SELECT DISTINCT ON (post_id, slug)
    post_id,
    name,
    slug,
    position
  FROM (
    SELECT
      p."id" AS post_id,
      BTRIM(keyword.value) AS name,
      BTRIM(
        REGEXP_REPLACE(
          LOWER(BTRIM(keyword.value)),
          '[^a-z0-9]+',
          '-',
          'g'
        ),
        '-'
      ) AS slug,
      keyword.position
    FROM "posts" p
    CROSS JOIN LATERAL REGEXP_SPLIT_TO_TABLE(
      COALESCE(p."keywords", ''),
      '[,，]'
    ) WITH ORDINALITY AS keyword(value, position)
    WHERE p."language" = 'en'
      AND keyword.position <= 6
  ) normalized
  WHERE name <> ''
    AND slug <> ''
  ORDER BY post_id, slug, position
), eligible_posts AS (
  SELECT post_id
  FROM english_keyword_tags
  GROUP BY post_id
  HAVING COUNT(*) >= 2
)
INSERT INTO "tags" ("name", "slug", "enName", "enSlug")
SELECT DISTINCT
  keyword.name,
  keyword.slug,
  keyword.name,
  keyword.slug
FROM english_keyword_tags keyword
INNER JOIN eligible_posts eligible ON eligible.post_id = keyword.post_id
ON CONFLICT DO NOTHING;

WITH english_keyword_tags AS (
  SELECT DISTINCT ON (post_id, slug)
    post_id,
    name,
    slug,
    position
  FROM (
    SELECT
      p."id" AS post_id,
      BTRIM(keyword.value) AS name,
      BTRIM(
        REGEXP_REPLACE(
          LOWER(BTRIM(keyword.value)),
          '[^a-z0-9]+',
          '-',
          'g'
        ),
        '-'
      ) AS slug,
      keyword.position
    FROM "posts" p
    CROSS JOIN LATERAL REGEXP_SPLIT_TO_TABLE(
      COALESCE(p."keywords", ''),
      '[,，]'
    ) WITH ORDINALITY AS keyword(value, position)
    WHERE p."language" = 'en'
      AND keyword.position <= 6
  ) normalized
  WHERE name <> ''
    AND slug <> ''
  ORDER BY post_id, slug, position
), eligible_posts AS (
  SELECT post_id
  FROM english_keyword_tags
  GROUP BY post_id
  HAVING COUNT(*) >= 2
), matched_tags AS (
  SELECT
    keyword.post_id,
    matched.id AS tag_id,
    ROW_NUMBER() OVER (
      PARTITION BY keyword.post_id
      ORDER BY keyword.position, matched.id
    ) AS position
  FROM english_keyword_tags keyword
  INNER JOIN eligible_posts eligible ON eligible.post_id = keyword.post_id
  CROSS JOIN LATERAL (
    SELECT t."id" AS id
    FROM "tags" t
    WHERE t."enSlug" = keyword.slug
      OR t."slug" = keyword.slug
      OR LOWER(t."enName") = LOWER(keyword.name)
      OR LOWER(t."name") = LOWER(keyword.name)
    ORDER BY
      CASE
        WHEN t."enSlug" = keyword.slug THEN 0
        WHEN t."slug" = keyword.slug THEN 1
        WHEN LOWER(t."enName") = LOWER(keyword.name) THEN 2
        ELSE 3
      END,
      t."id"
    LIMIT 1
  ) matched
), cleared AS (
  DELETE FROM "post_tags" existing
  USING eligible_posts eligible
  WHERE existing."postId" = eligible.post_id
)
INSERT INTO "post_tags" ("postId", "tagId")
SELECT DISTINCT post_id, tag_id
FROM matched_tags
ON CONFLICT DO NOTHING;

WITH ranked_keywords AS (
  SELECT
    p."id" AS post_id,
    BTRIM(keyword.value) AS name,
    BTRIM(
      REGEXP_REPLACE(
        LOWER(BTRIM(keyword.value)),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      '-'
    ) AS slug,
    keyword.position
  FROM "posts" p
  CROSS JOIN LATERAL REGEXP_SPLIT_TO_TABLE(
    COALESCE(p."keywords", ''),
    '[,，]'
  ) WITH ORDINALITY AS keyword(value, position)
  WHERE p."language" = 'en'
), first_keyword AS (
  SELECT DISTINCT ON (post_id) post_id, name, slug
  FROM ranked_keywords
  WHERE name <> ''
    AND slug <> ''
  ORDER BY post_id, position
), recommended_tags AS (
  SELECT
    keyword.post_id,
    matched.id AS tag_id,
    COALESCE(NULLIF(BTRIM(matched."enName"), ''), matched."name") AS tag_name
  FROM first_keyword keyword
  CROSS JOIN LATERAL (
    SELECT t."id", t."name", t."enName"
    FROM "tags" t
    WHERE t."enSlug" = keyword.slug
      OR t."slug" = keyword.slug
      OR LOWER(t."enName") = LOWER(keyword.name)
      OR LOWER(t."name") = LOWER(keyword.name)
    ORDER BY
      CASE
        WHEN t."enSlug" = keyword.slug THEN 0
        WHEN t."slug" = keyword.slug THEN 1
        WHEN LOWER(t."enName") = LOWER(keyword.name) THEN 2
        ELSE 3
      END,
      t."id"
    LIMIT 1
  ) matched
)
UPDATE "posts" p
SET
  "recommendedTagId" = recommended.tag_id,
  "recommendedTagName" = recommended.tag_name,
  "updatedAt" = NOW()
FROM recommended_tags recommended
WHERE p."id" = recommended.post_id;
