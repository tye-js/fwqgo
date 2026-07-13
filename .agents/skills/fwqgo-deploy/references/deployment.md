# FWQGO Deployment Reference

## Default Deployment

Production deployment is owned by `.github/workflows/deploy.yml`:

1. Prepare and verify the code locally.
2. Stop without committing or pushing.
3. The user manually commits and pushes to `main`.
4. The push triggers GitHub Actions.
5. GitHub Actions builds both apps, packages the standalone release, uploads it, optionally migrates the database, activates the release, and runs health checks.

Normal wording such as "部署", "构建部署", "发布到服务器", or "上线" does not authorize `npm run deploy:local`. It also does not authorize an automatic commit or push.

## Preparation Checks

Run from `/Users/liulu/Desktop/fwqgo`:

```bash
npm run lint
npm run typecheck
SKIP_ENV_VALIDATION=1 npm run build
```

Use `SKIP_ENV_VALIDATION=1` only for local verification. Production builds receive their complete environment from GitHub Actions secrets and variables.

## GitHub Actions Trigger

The workflow runs automatically on a push to `main`. It can also be manually dispatched from GitHub when the user explicitly requests that operation. Do not push or dispatch it on the user's behalf unless explicitly asked.

## Local Docker Fallback

The local upload script is not the normal deployment path. Use it only when the user explicitly requests the local deployment fallback.

Required local files include `scripts/deploy-local-build.sh`, `ecosystem.config.cjs`, and `.deploy.env`. Do not display `.deploy.env` or any secret it contains.

Explicit fallback command:

```bash
npm run deploy:local
```

For a packaging-only dry run when the user asks for an artifact:

```bash
npm run deploy:local -- --artifact-only
```

The deploy script:

1. Runs local `npm run typecheck` and `npm run lint` by default.
2. Packages a clean Docker build context, excluding local env files, `.next`, `.deploy`, `.git`, and `node_modules`.
3. Fetches `/var/www/fwqgo/shared/.env.production` from the server into the temporary build context without printing it.
4. Runs `npm ci --include=optional` and `npm run build` locally inside Docker Linux, so native dependencies such as `sharp` match the production OS.
5. Packages only the standalone runtime payload: `.next/standalone`, `.next/static`, `public`, `ecosystem.config.cjs`, and `package.json`.
6. Uploads the standalone artifact to the server.
7. Extracts it under `/var/www/fwqgo/releases/<release_id>`.
8. Symlinks `/var/www/fwqgo/shared/.env.production` into the release.
9. Points `/var/www/fwqgo/current` to the new release.
10. Starts PM2 from `/var/www/fwqgo/current/.next/standalone/server.js`.

## Post-Deploy Verification

Verify PM2 is running the current release:

```bash
set -a; source .deploy.env; set +a
ssh -i "$SSH_KEY" -p "$SSH_PORT" -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new "$SSH_USER@$SSH_HOST" 'printf "current="; readlink -f /var/www/fwqgo/current; pm2 describe fwqgo | sed -n "1,120p"'
```

Expected:

- `script path` is `/var/www/fwqgo/current/.next/standalone/server.js`
- `exec cwd` is `/var/www/fwqgo/current/.next/standalone`
- status is `online`

Verify the site:

```bash
curl -I https://fwqgo.com/
```

Expected:

- HTTP 200
- no TLS error

For image-specific checks:

```bash
curl -k -s -o /dev/null -w '%{http_code} %{content_type} %{size_download}\n' https://fwqgo.com/uploads/1733759818254-clawcloud.png
```

Expected:

- `200`
- image content type
- non-zero size

## Known Production Notes

- Production app path: `/var/www/fwqgo`
- Current release symlink: `/var/www/fwqgo/current`
- Release directory: `/var/www/fwqgo/releases`
- Shared environment file: `/var/www/fwqgo/shared/.env.production`
- Upload directory: `/var/www/uploads`
- PM2 app name: `fwqgo`
- Nginx proxies the public site and serves `/uploads`.

## Database Boundary

GitHub Actions owns routine production migrations through `scripts/migrate-prod.mjs`. Do not run a separate production migration unless the user explicitly asks for it and the production schema state has been verified first.
