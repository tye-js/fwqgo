#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT_DIR/.deploy.env}"

usage() {
  cat <<'EOF'
Usage: npm run deploy -- [--artifact-only] [--skip-checks]

Builds the Next.js standalone release locally inside Docker Linux, uploads the
standalone artifact, and quickly switches the PM2 release on the server.

Environment is read from .deploy.env by default.

Required for remote deploy:
  DEPLOY_HOST

Common optional variables:
  DEPLOY_USER=root
  DEPLOY_PORT=22
  DEPLOY_PATH=/var/www/fwqgo
  DEPLOY_SSH_KEY=/path/to/private/key
  DEPLOY_PASSWORD=...        # requires sshpass; otherwise ssh prompts
  SSH_HOST=...               # accepted as a compatibility alias
  SSH_USER=root              # accepted as a compatibility alias
  SSH_PORT=22                # accepted as a compatibility alias
  SSH_PATH=/var/www/fwqgo    # accepted as a compatibility alias
  SSH_KEY=/path/to/key       # accepted as a compatibility alias
  SSH_PASSWORD=...           # accepted as a compatibility alias
  RUN_CHECKS=1               # run local typecheck and lint before build
  RUN_MIGRATIONS=0           # not supported by standalone artifact deploy
  KEEP_RELEASES=5
  REMOTE_UPLOAD_DIR=/var/www/uploads
  NEXT_PUBLIC_CMS_URL=https://cms.fwqgo.com
  CMS_BASIC_AUTH_USERNAME=...
  CMS_BASIC_AUTH_PASSWORD=...
  DOCKER_IMAGE=node:24-bookworm-slim
  DOCKER_PLATFORM=linux/amd64
  LOCAL_BUILD_ENV_FILE=...   # override env file used only during local build
EOF
}

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

quote() {
  printf "%q" "$1"
}

if [[ -f "$DEPLOY_ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$DEPLOY_ENV_FILE"
  set +a
fi

ARTIFACT_ONLY=0
SKIP_CHECKS=0

for arg in "$@"; do
  case "$arg" in
    --artifact-only)
      ARTIFACT_ONLY=1
      ;;
    --skip-checks)
      SKIP_CHECKS=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $arg"
      ;;
  esac
done

DEPLOY_HOST="${DEPLOY_HOST:-${SSH_HOST:-}}"
DEPLOY_USER="${DEPLOY_USER:-${SSH_USER:-root}}"
DEPLOY_PORT="${DEPLOY_PORT:-${SSH_PORT:-22}}"
DEPLOY_PATH="${DEPLOY_PATH:-${SSH_PATH:-/var/www/fwqgo}}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-${SSH_KEY:-}}"
DEPLOY_PASSWORD="${DEPLOY_PASSWORD:-${SSH_PASSWORD:-}}"
RUN_CHECKS="${RUN_CHECKS:-1}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-0}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
REMOTE_UPLOAD_DIR="${REMOTE_UPLOAD_DIR:-/var/www/uploads}"
DOCKER_IMAGE="${DOCKER_IMAGE:-node:24-bookworm-slim}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
LOCAL_BUILD_ENV_FILE="${LOCAL_BUILD_ENV_FILE:-}"
RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%d%H%M%S)}"

STAGE_DIR="$ROOT_DIR/.deploy/stage-$RELEASE_ID"
PAYLOAD_DIR="$ROOT_DIR/.deploy/payload-$RELEASE_ID"
ARTIFACT="$ROOT_DIR/.deploy/fwqgo-$RELEASE_ID.tar.gz"
REMOTE_ARTIFACT="/tmp/fwqgo-$RELEASE_ID.tar.gz"

require_cmd docker
require_cmd npm
require_cmd rsync
require_cmd tar

if [[ "$RUN_MIGRATIONS" == "1" ]]; then
  fail "RUN_MIGRATIONS=1 is not supported by standalone artifact deploy. Run migrations separately before deploy."
fi

SSH_ARGS=(-p "$DEPLOY_PORT" -o StrictHostKeyChecking=accept-new)
SCP_ARGS=(-P "$DEPLOY_PORT" -o StrictHostKeyChecking=accept-new)

if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  SSH_ARGS+=(-i "$DEPLOY_SSH_KEY")
  SCP_ARGS+=(-i "$DEPLOY_SSH_KEY")
fi

SSH_BIN=(ssh)
SCP_BIN=(scp)

if [[ -z "${DEPLOY_SSH_KEY:-}" && -n "${DEPLOY_PASSWORD:-}" ]]; then
  require_cmd sshpass
  export SSHPASS="$DEPLOY_PASSWORD"
  SSH_BIN=(sshpass -e ssh)
  SCP_BIN=(sshpass -e scp)
fi

REMOTE="$DEPLOY_USER@$DEPLOY_HOST"

if [[ "$SKIP_CHECKS" != "1" && "$RUN_CHECKS" == "1" ]]; then
  log "Running typecheck"
  (cd "$ROOT_DIR" && npm run typecheck)

  log "Running lint"
  (cd "$ROOT_DIR" && npm run lint)
fi

log "Preparing Docker build context $RELEASE_ID"
rm -rf "$STAGE_DIR" "$PAYLOAD_DIR"
mkdir -p "$STAGE_DIR" "$PAYLOAD_DIR"

rsync -a --delete "$ROOT_DIR/" "$STAGE_DIR/" \
  --exclude ".git/" \
  --exclude ".next/" \
  --exclude ".deploy/" \
  --exclude "node_modules/" \
  --exclude ".env" \
  --exclude ".env.*" \
  --exclude ".deploy.env" \
  --exclude ".DS_Store"

if [[ -n "$LOCAL_BUILD_ENV_FILE" ]]; then
  [[ -f "$LOCAL_BUILD_ENV_FILE" ]] || fail "LOCAL_BUILD_ENV_FILE does not exist: $LOCAL_BUILD_ENV_FILE"
  cp "$LOCAL_BUILD_ENV_FILE" "$STAGE_DIR/.env.production"
elif [[ -n "${DEPLOY_HOST:-}" && "$ARTIFACT_ONLY" != "1" ]]; then
  log "Fetching server production env for local Docker build"
  "${SCP_BIN[@]}" "${SCP_ARGS[@]}" "$REMOTE:$DEPLOY_PATH/shared/.env.production" "$STAGE_DIR/.env.production"
elif [[ -f "$ROOT_DIR/.env.production" ]]; then
  cp "$ROOT_DIR/.env.production" "$STAGE_DIR/.env.production"
else
  fail "No production env available for build. Set LOCAL_BUILD_ENV_FILE or run a remote deploy with DEPLOY_HOST configured."
fi

log "Building standalone artifact in Docker ($DOCKER_IMAGE, $DOCKER_PLATFORM)"
docker run --rm \
  --platform "$DOCKER_PLATFORM" \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e NEXT_TELEMETRY_DISABLED=1 \
  -e PUPPETEER_SKIP_DOWNLOAD=true \
  -e npm_config_cache=/tmp/npm-cache \
  -v "$STAGE_DIR:/workspace" \
  -w /workspace \
  "$DOCKER_IMAGE" \
  bash -lc 'npm ci --include=optional && npm run build && mkdir -p .next/standalone/.next && rm -rf .next/standalone/.next/static .next/standalone/public && cp -R .next/static .next/standalone/.next/static && cp -R public .next/standalone/public'

[[ -f "$STAGE_DIR/.next/standalone/server.js" ]] || fail "Docker build did not produce .next/standalone/server.js"

log "Packaging standalone release $RELEASE_ID"
mkdir -p "$PAYLOAD_DIR/.next"
rsync -a "$STAGE_DIR/.next/standalone/" "$PAYLOAD_DIR/.next/standalone/"
cp "$STAGE_DIR/ecosystem.config.cjs" "$PAYLOAD_DIR/ecosystem.config.cjs"
cp "$STAGE_DIR/package.json" "$PAYLOAD_DIR/package.json"

tar -czf "$ARTIFACT" -C "$PAYLOAD_DIR" .
printf 'Created artifact: %s\n' "$ARTIFACT"

if [[ "$ARTIFACT_ONLY" == "1" ]]; then
  exit 0
fi

[[ -n "${DEPLOY_HOST:-}" ]] || fail "DEPLOY_HOST is required for remote deploy."

log "Uploading artifact to $REMOTE:$REMOTE_ARTIFACT"
"${SCP_BIN[@]}" "${SCP_ARGS[@]}" "$ARTIFACT" "$REMOTE:$REMOTE_ARTIFACT"

REMOTE_COMMAND="bash -s -- $(quote "$DEPLOY_PATH") $(quote "$RELEASE_ID") $(quote "$REMOTE_ARTIFACT") $(quote "$KEEP_RELEASES") $(quote "$REMOTE_UPLOAD_DIR")"

log "Activating standalone release on $REMOTE"
"${SSH_BIN[@]}" "${SSH_ARGS[@]}" "$REMOTE" "$REMOTE_COMMAND" <<'REMOTE_SCRIPT'
set -euo pipefail

deploy_path="$1"
release_id="$2"
remote_artifact="$3"
keep_releases="$4"
upload_dir="$5"

case "$deploy_path" in
  ""|"/"|"/var"|"/var/www")
    echo "Refusing unsafe DEPLOY_PATH: $deploy_path" >&2
    exit 1
    ;;
esac

releases_dir="$deploy_path/releases"
shared_dir="$deploy_path/shared"
release_dir="$releases_dir/$release_id"
current_link="$deploy_path/current"
previous_release="$(readlink -f "$current_link" 2>/dev/null || true)"

mkdir -p "$releases_dir" "$shared_dir" "$upload_dir"

if [[ ! -f "$shared_dir/.env.production" ]]; then
  cat > "$shared_dir/.env.production.example" <<EOF
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/fwqgo
NEXT_PUBLIC_URL=https://fwqgo.com
NEXT_PUBLIC_CMS_URL=https://cms.fwqgo.com
CMS_BASIC_AUTH_USERNAME=change-me
CMS_BASIC_AUTH_PASSWORD=change-me
PORT=3000
UPLOAD_DIR=$upload_dir
EOF
  echo "Missing $shared_dir/.env.production on server." >&2
  echo "Created $shared_dir/.env.production.example. Fill it, then rerun deploy." >&2
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is not installed on the server. Install it with: npm install -g pm2" >&2
  exit 1
fi

start_release() {
  local target_release="$1"

  if [[ ! -f "$target_release/ecosystem.config.cjs" || ! -f "$target_release/.next/standalone/server.js" ]]; then
    echo "Invalid standalone release: $target_release" >&2
    return 1
  fi

  APP_DIR="$target_release/.next/standalone" pm2 start "$target_release/ecosystem.config.cjs" --update-env
}

rollback_previous() {
  if [[ -n "$previous_release" && -d "$previous_release" ]]; then
    echo "Activation failed. Rolling back to $previous_release..."
    ln -sfn "$previous_release" "$current_link"
    pm2 delete fwqgo >/dev/null 2>&1 || true
    start_release "$previous_release" || true
    pm2 save || true
  fi
}

on_deploy_error() {
  status=$?
  trap - ERR
  rollback_previous
  exit "$status"
}

trap on_deploy_error ERR

rm -rf "$release_dir"
mkdir -p "$release_dir"
tar -xzf "$remote_artifact" -C "$release_dir"
ln -sfn "$shared_dir/.env.production" "$release_dir/.env.production"

[[ -f "$release_dir/.next/standalone/server.js" ]] || {
  echo "Artifact is missing .next/standalone/server.js" >&2
  exit 1
}

ln -sfn "$release_dir" "$current_link"

if pm2 describe fwqgo >/dev/null 2>&1; then
  pm2 delete fwqgo
fi

start_release "$current_link"
pm2 save
trap - ERR

rm -f "$remote_artifact"

find "$releases_dir" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +"$((keep_releases + 1))" | xargs rm -rf
REMOTE_SCRIPT

log "Deployment complete"
