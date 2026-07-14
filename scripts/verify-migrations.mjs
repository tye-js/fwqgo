import path from "node:path";

import { readMigrationManifest } from "./migration-manifest.mjs";

const migrationsFolder = path.resolve("drizzle");
const manifest = readMigrationManifest(migrationsFolder);

console.log(
  `Migration manifest verified: ${manifest.entries.length} migrations, latest=${manifest.latest.tag}`,
);
