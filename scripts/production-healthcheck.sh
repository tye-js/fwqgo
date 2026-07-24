#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT_DIR/.deploy.env}"
SITE_URL="${SITE_URL:-https://fwqgo.com}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '\n==> %s\n' "$*"
}

CURL_RETRY_ARGS=(--retry 3 --retry-delay 2 --retry-connrefused --retry-all-errors)

probe_http() {
  local label="$1"
  local target="$2"
  shift 2
  local result
  local curl_exit
  local status
  local elapsed
  local redirect

  if result="$(
    curl "${CURL_RETRY_ARGS[@]}" \
      --silent --show-error --head --output /dev/null \
      --write-out '%{http_code}\n%{time_total}\n%{redirect_url}' \
      --max-time 20 "$@" "$target"
  )"; then
    status="$(printf '%s\n' "$result" | sed -n '1p')"
    elapsed="$(printf '%s\n' "$result" | sed -n '2p')"
    redirect="$(printf '%s\n' "$result" | sed -n '3p')"
  else
    curl_exit=$?
    printf 'ERROR: HTTP probe failed: check=%s url=%s curl_exit=%s\n' "$label" "$target" "$curl_exit" >&2
    return "$curl_exit"
  fi

  printf 'HTTP probe [%s] url=%s status=%s elapsed=%ss redirect=%s\n' \
    "$label" "$target" "${status:-000}" "${elapsed:-unknown}" "${redirect:-none}" >&2
  printf '%s\n%s\n' "$status" "$redirect"
}

redirect_path() {
  node -e 'const value = process.argv[1] || ""; if (!value) process.exit(0); try { const url = new URL(value, "https://placeholder.local"); console.log(url.pathname.replace(/\/+$/, "") || "/"); } catch { process.exit(0); }' "$1"
}

redirect_host() {
  node -e 'const value = process.argv[1] || ""; if (!value || !value.includes("://")) process.exit(0); try { console.log(new URL(value).host); } catch { process.exit(0); }' "$1"
}

if [[ -f "$DEPLOY_ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$DEPLOY_ENV_FILE"
  set +a
fi

CMS_URL="${CMS_URL:-${NEXT_PUBLIC_CMS_URL:-https://cms.fwqgo.com}}"
SITE_URL="${SITE_URL%/}"
CMS_URL="${CMS_URL%/}"
CMS_HOST="$(node -e 'const value = process.argv[1] || "https://cms.fwqgo.com"; const url = new URL(value.includes("://") ? value : `https://${value}`); console.log(url.host);' "$CMS_URL")"
CMS_BASIC_AUTH_ENABLED=0
if [[ -n "${CMS_BASIC_AUTH_USERNAME:-}" && -n "${CMS_BASIC_AUTH_PASSWORD:-}" ]]; then
  CMS_BASIC_AUTH_ENABLED=1
fi

is_cms_login_redirect() {
  local status="$1"
  local redirect="$2"
  local path
  local host
  path="$(redirect_path "$redirect")"
  host="$(redirect_host "$redirect")"
  [[ ( "$status" == "307" || "$status" == "302" ) && "$path" == "/login" && ( -z "$host" || "$host" == "$CMS_HOST" ) ]]
}

read_cms_status_redirect() {
  local label="$1"
  local target="$2"
  if [[ "$CMS_BASIC_AUTH_ENABLED" == "1" ]]; then
    probe_http "$label" "$target" -u "$CMS_BASIC_AUTH_USERNAME:$CMS_BASIC_AUTH_PASSWORD"
    return
  fi

  probe_http "$label" "$target"
}

DEPLOY_HOST="${DEPLOY_HOST:-${SSH_HOST:-}}"
DEPLOY_USER="${DEPLOY_USER:-${SSH_USER:-root}}"
DEPLOY_PORT="${DEPLOY_PORT:-${SSH_PORT:-22}}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-${SSH_KEY:-}}"
DEPLOY_PASSWORD="${DEPLOY_PASSWORD:-${SSH_PASSWORD:-}}"

[[ -n "$DEPLOY_HOST" ]] || fail "DEPLOY_HOST is required."

SSH_ARGS=(-p "$DEPLOY_PORT" -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new)
if [[ -n "$DEPLOY_SSH_KEY" ]]; then
  SSH_ARGS+=(-i "$DEPLOY_SSH_KEY")
fi

SSH_BIN=(ssh)
if [[ -z "$DEPLOY_SSH_KEY" && -n "$DEPLOY_PASSWORD" ]]; then
  command -v sshpass >/dev/null 2>&1 || fail "sshpass is required for password SSH health checks."
  export SSHPASS="$DEPLOY_PASSWORD"
  SSH_BIN=(sshpass -e ssh)
fi

REMOTE="$DEPLOY_USER@$DEPLOY_HOST"

log "Checking remote release and PM2"
"${SSH_BIN[@]}" "${SSH_ARGS[@]}" "$REMOTE" '
set -euo pipefail
printf "current="
readlink -f /var/www/fwqgo/current
for app in fwqgo-web fwqgo-cms; do
  if pm2 describe "$app" >/dev/null 2>&1; then
    printf "\n[%s]\n" "$app"
    pm2 describe "$app" | awk "
      /status/ || /script path/ || /exec cwd/ || /node.js version/ || /unstable restarts/ { print }
    "
  else
    echo "Missing PM2 process: $app" >&2
    exit 1
  fi
done
'

log "Checking public homepage"
home_result="$(probe_http "Public homepage" "$SITE_URL/")"
home_status="$(printf '%s\n' "$home_result" | sed -n '1p')"
[[ "$home_status" == "200" ]] || fail "Homepage returned HTTP $home_status"
printf 'homepage=%s\n' "$home_status"

log "Checking application health endpoints"
web_health_result="$(probe_http "Web health endpoint" "$SITE_URL/api/health")"
web_health_status="$(printf '%s\n' "$web_health_result" | sed -n '1p')"
cms_health_result="$(read_cms_status_redirect "CMS health endpoint" "$CMS_URL/api/health")"
cms_health_status="$(printf '%s\n' "$cms_health_result" | sed -n '1p')"
[[ "$web_health_status" == "200" ]] || fail "Web health endpoint returned HTTP $web_health_status"
[[ "$cms_health_status" == "200" ]] || fail "CMS health endpoint returned HTTP $cms_health_status"
printf 'web_health=%s cms_health=%s\n' "$web_health_status" "$cms_health_status"

log "Checking public admin redirect to CMS"
public_admin_result="$(probe_http "Public admin redirect" "$SITE_URL/ai-rewrite/tasks")"
public_admin_status="$(printf '%s\n' "$public_admin_result" | sed -n '1p')"
public_admin_redirect="$(printf '%s\n' "$public_admin_result" | sed -n '2p')"
printf 'public_admin=%s %s\n' "$public_admin_status" "$public_admin_redirect"
if [[ ( "$public_admin_status" != "307" && "$public_admin_status" != "302" ) || "$public_admin_redirect" != "$CMS_URL"* ]]; then
  fail "Public admin route did not redirect to CMS: $public_admin_status ${public_admin_redirect:-none}"
fi

log "Checking public CMS API isolation"
public_api_result="$(probe_http "Public CMS API isolation" "$SITE_URL/api/upload")"
public_api_status="$(printf '%s\n' "$public_api_result" | sed -n '1p')"
printf 'public_api=%s\n' "$public_api_status"
[[ "$public_api_status" == "404" ]] || fail "Public CMS API returned HTTP $public_api_status"

log "Checking CMS home redirect"
cms_unauth_result="$(probe_http "CMS unauthenticated home" "$CMS_URL/")"
cms_unauth_status="$(printf '%s\n' "$cms_unauth_result" | sed -n '1p')"
cms_unauth_redirect="$(printf '%s\n' "$cms_unauth_result" | sed -n '2p')"
printf 'cms_unauth=%s %s\n' "$cms_unauth_status" "$cms_unauth_redirect"
if [[ "$cms_unauth_status" != "401" ]] && ! is_cms_login_redirect "$cms_unauth_status" "$cms_unauth_redirect"; then
  fail "Unexpected CMS unauth response: $cms_unauth_status ${cms_unauth_redirect:-none}"
fi

cms_home_result="$(read_cms_status_redirect "CMS authenticated home" "$CMS_URL/")"
cms_home_status="$(printf '%s\n' "$cms_home_result" | sed -n '1p')"
cms_home_redirect="$(printf '%s\n' "$cms_home_result" | sed -n '2p')"
printf 'cms_home=%s %s\n' "$cms_home_status" "$cms_home_redirect"
if [[ "$cms_home_status" != "200" ]] && ! is_cms_login_redirect "$cms_home_status" "$cms_home_redirect"; then
  fail "Unexpected CMS home response: $cms_home_status ${cms_home_redirect:-none}"
fi

log "Checking CMS public content redirect"
cms_public_result="$(read_cms_status_redirect "CMS public content redirect" "$CMS_URL/fwq/vps/page/1")"
cms_public_status="$(printf '%s\n' "$cms_public_result" | sed -n '1p')"
cms_public_redirect="$(printf '%s\n' "$cms_public_result" | sed -n '2p')"
printf 'cms_public=%s %s\n' "$cms_public_status" "$cms_public_redirect"
if [[ ( "$cms_public_status" != "307" && "$cms_public_status" != "302" ) || "$cms_public_redirect" != "$SITE_URL/fwq/vps/page/1"* ]]; then
  fail "CMS public content did not redirect to public site: $cms_public_status ${cms_public_redirect:-none}"
fi

log "Checking CMS admin auth redirect"
admin_result="$(read_cms_status_redirect "CMS admin auth redirect" "$CMS_URL/ai-rewrite/tasks")"
admin_status="$(printf '%s\n' "$admin_result" | sed -n '1p')"
admin_redirect="$(printf '%s\n' "$admin_result" | sed -n '2p')"
printf 'cms_admin=%s %s\n' "$admin_status" "$admin_redirect"
case "$admin_status" in
  307|302|200) ;;
  *) fail "Unexpected admin route response: $admin_status ${admin_redirect:-none}" ;;
esac

log "Health check complete"
