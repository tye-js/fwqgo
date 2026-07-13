---
name: fwqgo-deploy
description: Prepare and verify fwqgo releases that are deployed by GitHub Actions after the user manually pushes to main. Use when the user asks to deploy, publish, release, prepare a deployment, or verify a fwqgo deployment. Never run the local Docker deployment script for a normal deployment request; use it only when the user explicitly asks for the local deployment fallback.
---

# FWQGO Deploy

## Default Boundary

FWQGO uses `.github/workflows/deploy.yml` as its default production deployment path. A normal request such as "部署", "构建部署", "发布到服务器", or "上线" does not authorize a local Docker deployment, a commit, or a push.

For a normal deployment request:

1. Inspect the intended change scope.
2. Run the requested or appropriate local verification.
3. Check that the GitHub Actions workflow still covers the release requirements.
4. Stop and tell the user the changes are ready for their manual commit/push.
5. The user's push to `main` triggers GitHub Actions.

Do not run `npm run deploy:local`, commit, push, or trigger a workflow unless the user explicitly requests that exact action.

## Local Fallback

The local Docker upload path is emergency/manual-only. Use it only if the user explicitly says "使用本地部署脚本", "本地 Docker 部署", or directly requests `npm run deploy:local`. Read `references/deployment.md` before using it.

## Safety

- Never print `.deploy.env`, private keys, passwords, database URLs, or full PM2 environment dumps.
- Do not run database migrations outside the GitHub Actions release unless the user explicitly asks for a separate migration operation.
- Do not restart the whole server unless the user explicitly asks and service-level restart is insufficient.
- Do not revert unrelated dirty worktree changes.

## Standard Commands

Use the project npm scripts:

```bash
npm run typecheck
npm run lint
SKIP_ENV_VALIDATION=1 npm run build
```

## References

Read `references/deployment.md` when preparing or diagnosing a deployment, or before using the explicitly requested local fallback.
