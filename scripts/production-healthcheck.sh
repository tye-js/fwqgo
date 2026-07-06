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

read_curl_status_redirect() {
  local target="$1"
  shift
  curl "${CURL_RETRY_ARGS[@]}" -sS -o /dev/null -w '%{http_code}\n%{redirect_url}' --max-time 20 "$@" "$target"
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
  local target="$1"
  if [[ "$CMS_BASIC_AUTH_ENABLED" == "1" ]]; then
    read_curl_status_redirect "$target" -u "$CMS_BASIC_AUTH_USERNAME:$CMS_BASIC_AUTH_PASSWORD"
    return
  fi

  read_curl_status_redirect "$target"
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
home_status="$(curl "${CURL_RETRY_ARGS[@]}" -sS -o /dev/null -w '%{http_code}' --max-time 20 "$SITE_URL/")"
[[ "$home_status" == "200" ]] || fail "Homepage returned HTTP $home_status"
printf 'homepage=%s\n' "$home_status"

log "Checking public admin redirect to CMS"
public_admin_status="$(curl "${CURL_RETRY_ARGS[@]}" -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$SITE_URL/ai-rewrite/tasks")"
printf 'public_admin=%s\n' "$public_admin_status"
case "$public_admin_status" in
  307*\ "$CMS_URL"*|302*\ "$CMS_URL"*) ;;
  *) fail "Public admin route did not redirect to CMS: $public_admin_status" ;;
esac

log "Checking public CMS API isolation"
public_api_status="$(curl "${CURL_RETRY_ARGS[@]}" -sS -o /dev/null -w '%{http_code}' --max-time 20 "$SITE_URL/api/upload")"
printf 'public_api=%s\n' "$public_api_status"
[[ "$public_api_status" == "404" ]] || fail "Public CMS API returned HTTP $public_api_status"

log "Checking CMS home redirect"
cms_unauth_result="$(read_curl_status_redirect "$CMS_URL/")"
cms_unauth_status="$(printf '%s\n' "$cms_unauth_result" | sed -n '1p')"
cms_unauth_redirect="$(printf '%s\n' "$cms_unauth_result" | sed -n '2p')"
printf 'cms_unauth=%s %s\n' "$cms_unauth_status" "$cms_unauth_redirect"
if [[ "$cms_unauth_status" != "401" ]] && ! is_cms_login_redirect "$cms_unauth_status" "$cms_unauth_redirect"; then
  fail "Unexpected CMS unauth response: $cms_unauth_status ${cms_unauth_redirect:-none}"
fi

cms_home_result="$(read_cms_status_redirect "$CMS_URL/")"
cms_home_status="$(printf '%s\n' "$cms_home_result" | sed -n '1p')"
cms_home_redirect="$(printf '%s\n' "$cms_home_result" | sed -n '2p')"
printf 'cms_home=%s %s\n' "$cms_home_status" "$cms_home_redirect"
if [[ "$cms_home_status" != "200" ]] && ! is_cms_login_redirect "$cms_home_status" "$cms_home_redirect"; then
  fail "Unexpected CMS home response: $cms_home_status ${cms_home_redirect:-none}"
fi

log "Checking CMS public content redirect"
if [[ "$CMS_BASIC_AUTH_ENABLED" == "1" ]]; then
  cms_public_status="$(curl "${CURL_RETRY_ARGS[@]}" -sS -u "$CMS_BASIC_AUTH_USERNAME:$CMS_BASIC_AUTH_PASSWORD" -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$CMS_URL/fwq/vps/page/1")"
else
  cms_public_status="$(curl "${CURL_RETRY_ARGS[@]}" -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$CMS_URL/fwq/vps/page/1")"
fi
printf 'cms_public=%s\n' "$cms_public_status"
case "$cms_public_status" in
  307*\ "$SITE_URL/fwq/vps/page/1"*|302*\ "$SITE_URL/fwq/vps/page/1"*) ;;
  *) fail "CMS public content did not redirect to public site: $cms_public_status" ;;
esac

log "Checking CMS admin auth redirect"
if [[ "$CMS_BASIC_AUTH_ENABLED" == "1" ]]; then
  admin_status="$(curl "${CURL_RETRY_ARGS[@]}" -sS -u "$CMS_BASIC_AUTH_USERNAME:$CMS_BASIC_AUTH_PASSWORD" -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$CMS_URL/ai-rewrite/tasks")"
else
  admin_status="$(curl "${CURL_RETRY_ARGS[@]}" -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$CMS_URL/ai-rewrite/tasks")"
fi
printf 'cms_admin=%s\n' "$admin_status"
case "$admin_status" in
  307*|302*|200*) ;;
  *) fail "Unexpected admin route response: $admin_status" ;;
esac

log "Health check complete"
