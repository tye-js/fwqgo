import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const workflowPath = path.resolve(".github/workflows/deploy.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");
const localDeployPath = path.resolve("scripts/deploy-local-build.sh");
const localDeploy = fs.readFileSync(localDeployPath, "utf8");
const backupScriptPath = path.resolve("scripts/secure-db-backup.sh");
const backupScript = fs.readFileSync(backupScriptPath, "utf8");
const pgDumpRunnerPath = path.resolve("scripts/secure-pg-dump.mjs");
const pgDumpRunner = fs.readFileSync(pgDumpRunnerPath, "utf8");

if (
  !workflow.includes("- name: Prepare cache revalidation secret") ||
  !workflow.includes(
    "CONFIGURED_WEB_REVALIDATION_SECRET: ${{ secrets.WEB_REVALIDATION_SECRET }}",
  ) ||
  !workflow.includes('secret="$(openssl rand -hex 32)"') ||
  !workflow.includes(
    'printf \'WEB_REVALIDATION_SECRET=%s\\n\' "$secret" >> "$GITHUB_ENV"',
  )
) {
  throw new Error(
    "Deploy workflow must generate and persist a masked cache revalidation secret when the GitHub secret is absent",
  );
}

const requiredSecretsBlock = /required=\((?<body>[\s\S]*?)\n\s*\)/.exec(
  workflow,
);
const requiredSecretsBody = requiredSecretsBlock?.groups?.body ?? "";
if (requiredSecretsBody.includes("WEB_REVALIDATION_SECRET")) {
  throw new Error(
    "WEB_REVALIDATION_SECRET must not block deployment before its automatic fallback is prepared",
  );
}

for (const key of [
  "DATABASE_URL",
  "CMS_DATABASE_URL",
  "READ_DATABASE_URL",
  "ANALYTICS_DATABASE_URL",
  "SECRET_ENCRYPTION_KEYS",
  "SECRET_ENCRYPTION_KEY",
  "SECRET_ENCRYPTION_ACTIVE_KEY_ID",
]) {
  if (!workflow.includes(`${key}=%s`)) {
    throw new Error(`Deploy workflow does not persist optional ${key}`);
  }
}

const requiredDatabaseSecrets = [
  "DATABASE_URL",
  "CMS_DATABASE_URL",
  "READ_DATABASE_URL",
  "ANALYTICS_DATABASE_URL",
];
for (const key of requiredDatabaseSecrets) {
  if (!requiredSecretsBody.includes(key)) {
    throw new Error(`${key} must be required by the deploy workflow`);
  }

  const secretReference = `${key}: ` + "${{ secrets." + key + " }}";
  if (!workflow.includes(secretReference)) {
    throw new Error(`${key} must come from its dedicated GitHub secret`);
  }
}

for (const obsoleteSecret of [
  "CMS_USERNAME",
  "CMS_PASSWORD",
  "READ_USERNAME",
  "READ_PASSWORD",
  "GOOGLE_AI_API_KEY",
]) {
  if (workflow.includes(`secrets.${obsoleteSecret}`)) {
    throw new Error(
      `Deploy workflow must not inject obsolete secret ${obsoleteSecret}`,
    );
  }
}

const heredocStart = "cat > \"$remote_script\" <<'REMOTE_SCRIPT'";
const startIndex = workflow.indexOf(heredocStart);

if (startIndex < 0) {
  throw new Error("Deploy workflow is missing the remote activation script");
}

const bodyStart = workflow.indexOf("\n", startIndex) + 1;
const endMarker = "\n          REMOTE_SCRIPT";
const bodyEnd = workflow.indexOf(endMarker, bodyStart);

if (bodyStart === 0 || bodyEnd < 0) {
  throw new Error(
    "Deploy workflow has an unterminated remote activation script",
  );
}

const remoteScript = workflow
  .slice(bodyStart, bodyEnd)
  .split("\n")
  .map((line) => line.replace(/^ {10}/, ""))
  .join("\n");

const syntaxCheck = spawnSync("bash", ["-n"], {
  input: remoteScript,
  encoding: "utf8",
});

if (syntaxCheck.status !== 0) {
  throw new Error(
    `Remote activation script failed bash -n:\n${syntaxCheck.stderr.trim()}`,
  );
}

for (const { label, filePath } of [
  { label: "Local deployment script", filePath: localDeployPath },
  { label: "Secure database backup script", filePath: backupScriptPath },
]) {
  const result = spawnSync("bash", ["-n", filePath], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${label} failed bash -n:\n${result.stderr.trim()}`);
  }
}

const pgDumpRunnerSyntax = spawnSync("node", ["--check", pgDumpRunnerPath], {
  encoding: "utf8",
});
if (pgDumpRunnerSyntax.status !== 0) {
  throw new Error(
    `Secure pg_dump runner failed node --check:\n${pgDumpRunnerSyntax.stderr.trim()}`,
  );
}

for (const source of [workflow, localDeploy]) {
  for (const requiredValue of [
    "KEEP_DB_BACKUPS",
    "DB_BACKUP_RETENTION_DAYS",
    "secure-db-backup.sh",
    "secure-pg-dump.mjs",
  ]) {
    if (!source.includes(requiredValue)) {
      throw new Error(
        `Deployment path is missing database backup control: ${requiredValue}`,
      );
    }
  }
}

for (const requiredFragment of [
  'chmod 700 "$backup_dir"',
  "umask 077",
  'node "$pg_dump_runner" "$database_env_file" "$backup_tmp"',
  'pg_restore --list "$backup_tmp"',
  'chmod 600 "$backup_tmp"',
  'mv -f "$backup_tmp" "$backup_file"',
  '-mtime "+$retention_days"',
  "while ((${#backup_files[@]} > keep_count))",
]) {
  if (!backupScript.includes(requiredFragment)) {
    throw new Error(
      `Secure database backup is missing invariant: ${requiredFragment}`,
    );
  }
}

if (backupScript.includes('source "$database_env_file"')) {
  throw new Error(
    "Database environment files must not be executed as shell code",
  );
}
if (
  !pgDumpRunner.includes('parsedUrl.username = ""') ||
  !pgDumpRunner.includes('parsedUrl.password = ""') ||
  !pgDumpRunner.includes("delete childEnvironment[key]")
) {
  throw new Error("Database credentials must not be exposed in pg_dump argv");
}
if (
  remoteScript.includes('source "$shared_dir/.env.production"') ||
  localDeploy.includes('source "$shared_dir/.env.production"')
) {
  throw new Error(
    "Deployment scripts must parse runtime env files without sourcing them",
  );
}

const backupTestRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "fwqgo-secure-backup-"),
);
try {
  const fakeBin = path.join(backupTestRoot, "bin");
  const backupDir = path.join(backupTestRoot, "backups");
  const databaseEnvFile = path.join(backupTestRoot, ".env.production");
  fs.mkdirSync(fakeBin);
  fs.mkdirSync(backupDir, { mode: 0o755 });

  const fakePgDump = path.join(fakeBin, "pg_dump");
  fs.writeFileSync(
    fakePgDump,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'output=""',
      'database_arg=""',
      'for arg in "$@"; do',
      '  [[ "$arg" != *"super-secret"* ]] || exit 90',
      '  [[ "$arg" != *"backup%2Buser"* ]] || exit 90',
      '  case "$arg" in',
      '    --dbname=*) database_arg="${arg#--dbname=}" ;;',
      '    --file=*) output="${arg#--file=}" ;;',
      "  esac",
      "done",
      '[[ "$database_arg" == "postgresql://127.0.0.1:5432/fwqgo_test?sslmode=require" ]] || exit 91',
      '[[ "${PGUSER:-}" == "backup+user" ]] || exit 91',
      '[[ "${PGPASSWORD:-}" == "p@ss:word-super-secret" ]] || exit 91',
      '[[ -z "${DATABASE_URL:-}" && -z "${PGDATABASE:-}" && -n "$output" ]] || exit 91',
      "printf 'fake custom archive\\n' > \"$output\"",
      '[[ "${FAKE_PG_DUMP_FAIL:-0}" != "1" ]] || exit 92',
      "",
    ].join("\n"),
    { mode: 0o755 },
  );

  const fakePgRestore = path.join(fakeBin, "pg_restore");
  fs.writeFileSync(
    fakePgRestore,
    `#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "--list" && -s "$2" ]]
`,
    { mode: 0o755 },
  );

  const now = Date.now();
  for (let index = 0; index < 5; index += 1) {
    const oldBackup = path.join(backupDir, `fwqgo-before-old-${index}.dump`);
    fs.writeFileSync(oldBackup, "old backup", { mode: 0o644 });
    const timestamp = new Date(now - (index + 1) * 60_000);
    fs.utimesSync(oldBackup, timestamp, timestamp);
  }

  const testDatabaseUrl =
    "postgresql://backup%2Buser:p%40ss%3Aword-super-secret@127.0.0.1:5432/fwqgo_test?sslmode=require";
  fs.writeFileSync(databaseEnvFile, `DATABASE_URL=${testDatabaseUrl}\n`, {
    mode: 0o600,
  });
  const backupEnvironment = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
    DATABASE_URL: "postgresql://stale:stale@invalid.invalid/stale",
  };
  const success = spawnSync(
    "bash",
    [backupScriptPath, backupDir, "test-release", "3", "30", databaseEnvFile],
    { encoding: "utf8", env: backupEnvironment },
  );
  if (success.status !== 0) {
    throw new Error(
      `Secure backup smoke test failed:\n${success.stderr.trim()}`,
    );
  }
  if (
    `${success.stdout}\n${success.stderr}`.includes(testDatabaseUrl) ||
    `${success.stdout}\n${success.stderr}`.includes("p@ss:word-super-secret")
  ) {
    throw new Error("Secure backup output exposed DATABASE_URL");
  }

  const backupMode = fs.statSync(backupDir).mode & 0o777;
  if (backupMode !== 0o700) {
    throw new Error(
      `Secure backup directory mode is ${backupMode.toString(8)}; expected 700`,
    );
  }

  const retainedBackups = fs
    .readdirSync(backupDir)
    .filter((name) => name.endsWith(".dump"));
  if (
    retainedBackups.length !== 3 ||
    !retainedBackups.includes("fwqgo-before-test-release.dump")
  ) {
    throw new Error(
      `Secure backup retention kept unexpected files: ${retainedBackups.join(", ")}`,
    );
  }
  for (const backup of retainedBackups) {
    const mode = fs.statSync(path.join(backupDir, backup)).mode & 0o777;
    if (mode !== 0o600) {
      throw new Error(
        `Secure backup file ${backup} has mode ${mode.toString(8)}; expected 600`,
      );
    }
  }

  const failure = spawnSync(
    "bash",
    [backupScriptPath, backupDir, "failed-release", "3", "30", databaseEnvFile],
    {
      encoding: "utf8",
      env: { ...backupEnvironment, FAKE_PG_DUMP_FAIL: "1" },
    },
  );
  if (failure.status === 0) {
    throw new Error("Secure backup smoke test expected pg_dump failure");
  }
  const failedArtifacts = fs
    .readdirSync(backupDir)
    .filter((name) => name.includes("failed-release"));
  if (failedArtifacts.length > 0) {
    throw new Error(
      `Failed secure backup left artifacts: ${failedArtifacts.join(", ")}`,
    );
  }
} finally {
  fs.rmSync(backupTestRoot, { recursive: true, force: true });
}

const readEnvFunction = /read_env_value\(\) \{(?<body>[\s\S]*?)\n\}/.exec(
  remoteScript,
);

if (!readEnvFunction?.groups?.body) {
  throw new Error("Remote activation script is missing read_env_value()");
}

const outputCount = [...readEnvFunction.groups.body.matchAll(/printf "%s"/g)]
  .length;

if (outputCount !== 1) {
  throw new Error(
    `read_env_value() must emit exactly one value; found ${outputCount} outputs`,
  );
}

console.log(
  "Deployment workflow verified: remote activation shell and secure database backups are valid",
);
