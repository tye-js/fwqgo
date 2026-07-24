#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

backup_dir="${1:-}"
release_id="${2:-}"
keep_count="${3:-10}"
retention_days="${4:-30}"
database_env_file="${5:-}"

[[ "$backup_dir" == /* && "$backup_dir" != "/" ]] || fail "A safe absolute backup directory is required"
[[ "$release_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || fail "Release ID contains unsafe characters"
[[ "$keep_count" =~ ^[1-9][0-9]{0,2}$ ]] || fail "Backup count must be an integer between 1 and 100"
[[ "$retention_days" =~ ^[1-9][0-9]{0,3}$ ]] || fail "Backup retention days must be an integer between 1 and 3650"
[[ "$database_env_file" == /* && -f "$database_env_file" && -r "$database_env_file" ]] || fail "A readable absolute database environment file is required"

keep_count=$((10#$keep_count))
retention_days=$((10#$retention_days))
((keep_count <= 100)) || fail "Backup count must be an integer between 1 and 100"
((retention_days <= 3650)) || fail "Backup retention days must be an integer between 1 and 3650"

command -v pg_dump >/dev/null 2>&1 || fail "pg_dump is required when database migrations are enabled"
command -v pg_restore >/dev/null 2>&1 || fail "pg_restore is required to verify the database backup"
command -v node >/dev/null 2>&1 || fail "node is required to prepare a secure database backup"

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
pg_dump_runner="$script_dir/secure-pg-dump.mjs"
[[ -f "$pg_dump_runner" ]] || fail "Secure pg_dump runner is missing"

if [[ -L "$backup_dir" ]]; then
  fail "Backup directory must not be a symbolic link: $backup_dir"
fi
if [[ -e "$backup_dir" && ! -d "$backup_dir" ]]; then
  fail "Backup path is not a directory: $backup_dir"
fi

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
[[ -O "$backup_dir" ]] || fail "Backup directory must be owned by the deployment user: $backup_dir"

# Repair permissions on backups produced by older deployment versions.
find "$backup_dir" -type f \
  \( -name 'fwqgo-before-*.dump' -o -name 'fwqgo-before-*.dump.partial.*' \) \
  -exec chmod 600 {} +

backup_file="$backup_dir/fwqgo-before-${release_id}.dump"
backup_tmp="${backup_file}.partial.$$"

cleanup() {
  if [[ -n "${backup_tmp:-}" ]]; then
    rm -f "$backup_tmp"
  fi
}

trap cleanup EXIT
trap 'exit 1' HUP INT TERM

echo "Creating verified database backup before migrations: $backup_file"
if ! (
  umask 077
  node "$pg_dump_runner" "$database_env_file" "$backup_tmp"
); then
  fail "Database backup failed; migrations were not started"
fi

[[ -s "$backup_tmp" ]] || fail "Database backup is empty; migrations were not started"
if ! (
  pg_restore --list "$backup_tmp" >/dev/null
); then
  fail "Database backup verification failed; migrations were not started"
fi

chmod 600 "$backup_tmp"
mv -f "$backup_tmp" "$backup_file"
chmod 600 "$backup_file"
backup_tmp=""

find "$backup_dir" -type f -name 'fwqgo-before-*.dump' \
  -mtime "+$retention_days" -exec rm -f {} +
find "$backup_dir" -type f -name 'fwqgo-before-*.dump.partial.*' \
  -mtime +1 -exec rm -f {} +

shopt -s nullglob
backup_files=("$backup_dir"/fwqgo-before-*.dump)
while ((${#backup_files[@]} > keep_count)); do
  oldest="${backup_files[0]}"
  for candidate in "${backup_files[@]:1}"; do
    if [[ "$oldest" -nt "$candidate" ]]; then
      oldest="$candidate"
    fi
  done
  rm -f "$oldest"
  backup_files=("$backup_dir"/fwqgo-before-*.dump)
done
shopt -u nullglob

printf 'Database backup ready: %s (mode 600, retained=%s, max=%s, days=%s)\n' \
  "$backup_file" "${#backup_files[@]}" "$keep_count" "$retention_days"
