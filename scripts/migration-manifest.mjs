import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MIGRATION_FILE_PATTERN = /^\d{4}_.+\.sql$/;

/**
 * @typedef {{
 *   index: number;
 *   tag: string;
 *   createdAt: number;
 *   fileName: string;
 *   hash: string;
 * }} MigrationManifestEntry
 */

/** @param {string} message @returns {never} */
function fail(message) {
  throw new Error(`Invalid migration manifest: ${message}`);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {string} migrationsFolder
 * @returns {{ entries: MigrationManifestEntry[]; latest: MigrationManifestEntry }}
 */
export function readMigrationManifest(migrationsFolder) {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) {
    fail(`missing ${journalPath}`);
  }

  /** @type {unknown} */
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  if (
    !isRecord(journal) ||
    !Array.isArray(journal.entries) ||
    journal.entries.length === 0
  ) {
    fail("journal contains no entries");
  }

  const sqlFileNames = fs
    .readdirSync(migrationsFolder)
    .filter((name) => MIGRATION_FILE_PATTERN.test(name))
    .sort();
  const expectedFileNames = new Set();
  const tags = new Set();
  const timestamps = new Set();
  let previousTimestamp = -1;

  const entries = journal.entries.map((rawEntry, position) => {
    if (!isRecord(rawEntry)) {
      fail(`journal entry ${position} is not an object`);
    }

    const index = rawEntry.idx;
    const tag = rawEntry.tag;
    const createdAt = rawEntry.when;
    if (!Number.isSafeInteger(index) || index !== position) {
      fail(`journal index ${String(index)} must be ${position}`);
    }
    if (typeof tag !== "string" || !tag.trim()) {
      fail(`journal entry ${position} has no tag`);
    }
    if (tags.has(tag)) {
      fail(`duplicate tag ${tag}`);
    }
    tags.add(tag);

    if (
      !Number.isSafeInteger(createdAt) ||
      typeof createdAt !== "number" ||
      createdAt <= previousTimestamp
    ) {
      fail(`timestamp for ${tag} is not strictly increasing`);
    }
    if (timestamps.has(createdAt)) {
      fail(`duplicate timestamp ${createdAt}`);
    }
    timestamps.add(createdAt);
    previousTimestamp = createdAt;

    const fileName = `${tag}.sql`;
    const filePath = path.join(migrationsFolder, fileName);
    expectedFileNames.add(fileName);
    if (!fs.existsSync(filePath)) {
      fail(`missing SQL file ${fileName}`);
    }

    const sql = fs.readFileSync(filePath, "utf8");
    if (!sql.trim()) {
      fail(`SQL file ${fileName} is empty`);
    }

    return {
      index: position,
      tag,
      createdAt,
      fileName,
      hash: createHash("sha256").update(sql).digest("hex"),
    };
  });

  const extraFiles = sqlFileNames.filter(
    (fileName) => !expectedFileNames.has(fileName),
  );
  if (extraFiles.length > 0) {
    fail(`SQL files missing from journal: ${extraFiles.join(", ")}`);
  }

  const latest = entries.at(-1);
  if (!latest) {
    fail("journal contains no valid entries");
  }

  return { entries, latest };
}
