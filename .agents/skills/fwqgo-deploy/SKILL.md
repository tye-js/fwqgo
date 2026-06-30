---
name: fwqgo-deploy
description: Deploy the fwqgo Next.js project to its production server by building a Linux standalone artifact locally in Docker, uploading it, and switching the PM2 release. Use only when the user explicitly asks to deploy, publish, release, build-and-deploy, upload to the server, or verify a deployment for fwqgo; do not use for ordinary code edits, tests, reviews, or local builds unless deployment is explicitly requested.
---

# FWQGO Deploy

## Core Rule

Do not deploy implicitly. Treat deployment as production-impacting work and run it only after the user gives an explicit deployment command, such as "部署", "构建部署", "发布到服务器", "上线", or "npm run deploy".

For normal code changes, stop after local verification and tell the user deployment is ready but not run.

## Workflow

1. Work from `/Users/liulu/Desktop/fwqgo`.
2. Read project rules in `AGENTS.md` if not already loaded.
3. Confirm the deployment script exists: `scripts/deploy-local-build.sh`.
4. Confirm `.deploy.env` exists, but do not print its contents.
5. Run `npm run deploy` only when the user explicitly requested deployment.
6. After deployment, verify the server process and public site. Use `references/deployment.md` for exact checks.

## Safety

- Never print `.deploy.env`, private keys, passwords, database URLs, or full PM2 environment dumps.
- Do not run database migrations during deploy unless the user explicitly asks for migration deployment.
- Do not restart the whole server unless the user explicitly asks and service-level restart is insufficient.
- Do not revert unrelated dirty worktree changes.
- If deployment fails after uploading but before activation, inspect the error before retrying.

## Standard Commands

Use the project npm scripts:

```bash
npm run typecheck
npm run lint
npm run deploy
```

`npm run deploy` performs local checks, fetches the server production env for build-time configuration, builds a Linux standalone artifact locally in Docker, uploads it using `.deploy.env`, updates `/var/www/fwqgo/current`, and restarts PM2. The production server must not run `next build` during routine deploys.

## References

Read `references/deployment.md` when preparing to deploy or diagnosing a deployment.
