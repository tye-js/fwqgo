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

if [[ -f "$DEPLOY_ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$DEPLOY_ENV_FILE"
  set +a
fi

CMS_URL="${CMS_URL:-${NEXT_PUBLIC_CMS_URL:-https://cms.fwqgo.com}}"
SITE_URL="${SITE_URL%/}"
CMS_URL="${CMS_URL%/}"
CMS_AUTH_CURL_ARGS=()
if [[ -n "${CMS_BASIC_AUTH_USERNAME:-}" && -n "${CMS_BASIC_AUTH_PASSWORD:-}" ]]; then
  CMS_AUTH_CURL_ARGS=(-u "$CMS_BASIC_AUTH_USERNAME:$CMS_BASIC_AUTH_PASSWORD")
fi

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
pm2 describe fwqgo | awk "
  /status/ || /script path/ || /exec cwd/ || /node.js version/ || /unstable restarts/ { print }
"
'

log "Checking public homepage"
home_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$SITE_URL/")"
[[ "$home_status" == "200" ]] || fail "Homepage returned HTTP $home_status"
printf 'homepage=%s\n' "$home_status"

log "Checking public admin redirect to CMS"
public_admin_status="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$SITE_URL/end/ai-rewrite/tasks")"
printf 'public_admin=%s\n' "$public_admin_status"
case "$public_admin_status" in
  307*\ "$CMS_URL"*|302*\ "$CMS_URL"*) ;;
  *) fail "Public admin route did not redirect to CMS: $public_admin_status" ;;
esac

log "Checking public CMS API isolation"
public_api_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$SITE_URL/api/upload")"
printf 'public_api=%s\n' "$public_api_status"
[[ "$public_api_status" == "404" ]] || fail "Public CMS API returned HTTP $public_api_status"

log "Checking CMS home redirect"
if [[ ${#CMS_AUTH_CURL_ARGS[@]} -gt 0 ]]; then
  cms_unauth_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$CMS_URL/")"
  printf 'cms_unauth=%s\n' "$cms_unauth_status"
  [[ "$cms_unauth_status" == "401" ]] || fail "CMS Basic Auth did not return HTTP 401: $cms_unauth_status"
fi

cms_home_status="$(curl -sS "${CMS_AUTH_CURL_ARGS[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$CMS_URL/")"
printf 'cms_home=%s\n' "$cms_home_status"
case "$cms_home_status" in
  307*\ "$CMS_URL/end"*|302*\ "$CMS_URL/end"*|200*) ;;
  *) fail "Unexpected CMS home response: $cms_home_status" ;;
esac

log "Checking CMS public content redirect"
cms_public_status="$(curl -sS "${CMS_AUTH_CURL_ARGS[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$CMS_URL/servers")"
printf 'cms_public=%s\n' "$cms_public_status"
case "$cms_public_status" in
  307*\ "$SITE_URL/servers"*|302*\ "$SITE_URL/servers"*) ;;
  *) fail "CMS public content did not redirect to public site: $cms_public_status" ;;
esac

log "Checking CMS admin auth redirect"
admin_status="$(curl -sS "${CMS_AUTH_CURL_ARGS[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$CMS_URL/end/ai-rewrite/tasks")"
printf 'cms_admin=%s\n' "$admin_status"
case "$admin_status" in
  307*|302*|200*) ;;
  *) fail "Unexpected admin route response: $admin_status" ;;
esac

log "Health check complete"
