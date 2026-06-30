# FWQGO Deployment Reference

## Trigger Boundary

Deploy only on explicit user commands:

- "部署"
- "构建部署"
- "发布到服务器"
- "上线"
- "run deploy"
- "npm run deploy"

Do not deploy just because files changed or tests passed.

## Local Preconditions

Run from:

```bash
/Users/liulu/Desktop/fwqgo
```

Required local files:

- `package.json`
- `scripts/deploy-local-build.sh`
- `ecosystem.config.cjs`
- `.deploy.env`

Do not display `.deploy.env`. It may contain SSH host, user, port, key path, password, or deployment path.

## Deployment Command

For a full production deployment:

```bash
npm run deploy
```

For a packaging-only dry run when the user asks for an artifact:

```bash
npm run deploy -- --artifact-only
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

Do not run migrations as part of routine deploy. Standalone artifact deploy does not support `RUN_MIGRATIONS=1`; if database changes are part of the release, run `npm run db:migrate` as an explicit separate operation before deployment.
