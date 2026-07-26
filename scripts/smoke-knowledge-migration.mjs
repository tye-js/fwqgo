import fs from "node:fs";
import path from "node:path";

import postgres from "postgres";

const databaseUrl = process.env.KNOWLEDGE_MIGRATION_SMOKE_DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("KNOWLEDGE_MIGRATION_SMOKE_DATABASE_URL is required");
}

const parsedUrl = new URL(databaseUrl);
const databaseName = parsedUrl.pathname.replace(/^\//, "");
if (
  !["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname) ||
  !databaseName.endsWith("_knowledge_smoke")
) {
  throw new Error(
    "Migration smoke tests only run on localhost databases ending in _knowledge_smoke",
  );
}

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 10,
  connection: { TimeZone: "UTC" },
});

/** @param {string} fileName @returns {string[]} */
function migrationStatements(fileName) {
  return fs
    .readFileSync(path.resolve("drizzle", fileName), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/** @param {string} fileName */
async function applyMigration(fileName) {
  for (const statement of migrationStatements(fileName)) {
    await sql.unsafe(statement);
  }
}

/**
 * @param {string} label
 * @param {() => Promise<unknown>} operation
 */
async function expectRejected(label, operation) {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(`Expected database rejection: ${label}`);
}

try {
  await sql`drop table if exists "knowledge_articles" cascade`;
  await sql`drop table if exists "knowledge_categories" cascade`;

  await sql`
    create table "knowledge_categories" (
      "id" serial primary key,
      "name" text not null unique,
      "slug" varchar(160) not null unique,
      "description" varchar(800),
      "sortOrder" integer default 0 not null,
      "createdAt" timestamp default now() not null,
      "updatedAt" timestamp
    )
  `;
  await sql`
    create table "knowledge_articles" (
      "id" serial primary key,
      "categoryId" integer not null references "knowledge_categories"("id") on delete restrict,
      "title" text not null,
      "slug" varchar(320) not null unique,
      "summary" varchar(1200),
      "content" text not null,
      "keywords" text,
      "aliases" text,
      "retrievalTerms" text,
      "sourceNotes" text,
      "published" boolean default false not null,
      "allowAiReference" boolean default true not null,
      "publishedAt" timestamp,
      "createdBy" text,
      "createdAt" timestamp default now() not null,
      "updatedAt" timestamp,
      constraint "knowledge_articles_content_check" check (length(btrim("content")) > 0)
    )
  `;

  await sql`
    insert into "knowledge_categories" ("name", "slug", "description", "sortOrder")
    values
      ('服务器配置', 'server-configuration', 'configuration', 10),
      ('网络线路', 'network-routes', 'routes', 20),
      ('机房与地区', 'datacenter-regions', 'regions', 30),
      ('IP 与网络', 'ip-network', 'networking', 40),
      ('系统与运维', 'system-operations', 'operations', 50),
      ('安全与应用', 'security-use-cases', 'security', 60)
  `;
  await sql`
    insert into "knowledge_articles" (
      "categoryId", "title", "slug", "content", "published",
      "allowAiReference", "publishedAt", "createdAt", "updatedAt"
    )
    values
      (1, 'Draft sample', 'migration-draft-sample', 'draft content', false, true, null, '2025-01-01', '2025-01-02'),
      (2, 'Published sample', 'migration-published-sample', 'published content', true, true, '2025-02-02', '2025-02-01', '2025-02-03'),
      (3, 'Missing publication time', 'migration-missing-published-at', 'published content', true, false, null, '2025-03-01', '2025-03-04')
  `;

  await applyMigration("0051_broken_turbo.sql");
  const [releaseADraft] = await sql`
    select "allowAiReference"
    from "knowledge_articles"
    where "slug" = 'migration-draft-sample'
  `;
  if (releaseADraft?.allowAiReference !== false) {
    throw new Error("Release A did not close AI access for the draft sample");
  }

  await applyMigration("0052_charming_jackal.sql");

  const rows = await sql`
    select
      "slug", "language", "contentRevision", "translatedFromRevision",
      "published", "allowAiReference", "publishedAt", "contentUpdatedAt",
      "createdAt", "updatedAt",
      to_char("publishedAt", 'YYYY-MM-DD HH24:MI:SS') as "publishedAtText"
    from "knowledge_articles"
    order by "id"
  `;
  if (rows.length !== 3)
    throw new Error(`Expected 3 rows, received ${rows.length}`);
  if (
    rows.some(
      (row) =>
        row.language !== "zh" ||
        row.contentRevision !== 1 ||
        row.translatedFromRevision !== null ||
        !(row.contentUpdatedAt instanceof Date),
    )
  ) {
    throw new Error(
      "Release B article backfill produced invalid language or version data",
    );
  }

  const published = rows.find(
    (row) => row.slug === "migration-published-sample",
  );
  const repaired = rows.find(
    (row) => row.slug === "migration-missing-published-at",
  );
  if (!published?.allowAiReference) {
    throw new Error("Release B changed an existing published AI authorization");
  }
  if (
    !repaired?.publishedAt ||
    repaired.publishedAtText !== "2025-03-04 00:00:00"
  ) {
    throw new Error(
      "Release B did not repair publishedAt from trusted historical time",
    );
  }

  const localizedCategories = await sql`
    select count(*)::int as count
    from "knowledge_categories"
    where nullif(btrim("enName"), '') is not null
      and nullif(btrim("enSlug"), '') is not null
      and nullif(btrim("enDescription"), '') is not null
  `;
  if (localizedCategories[0]?.count !== 6) {
    throw new Error("Release B did not localize all six knowledge categories");
  }

  await expectRejected(
    "draft AI authorization",
    () =>
      sql`
      insert into "knowledge_articles" (
        "categoryId", "title", "slug", "content", "published", "allowAiReference", "language"
      ) values (1, 'Invalid AI draft', 'invalid-ai-draft', 'content', false, true, 'zh')
    `,
  );
  await expectRejected(
    "English row without a source",
    () =>
      sql`
      insert into "knowledge_articles" (
        "categoryId", "title", "slug", "content", "published", "allowAiReference", "language"
      ) values (1, 'Invalid English row', 'invalid-english-row', 'content', false, false, 'en')
    `,
  );

  console.log(
    "Knowledge migration smoke passed: Release A -> Release B, rows=3, categories=6, constraints=2",
  );
} finally {
  await sql.end();
}
