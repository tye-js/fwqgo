# AGENTS.md

This file gives coding agents the local project rules for `fwqgo`.

## Project Overview

`fwqgo` is a monorepo-style Next.js App Router project for server/VPS deal content, a separate CMS, SEO pages, affiliate links, and content scraping.

Core stack:

- Next.js App Router, React, TypeScript
- Tailwind CSS and shadcn/Radix UI components
- PostgreSQL with Drizzle ORM
- Custom session-based admin authentication
- Puppeteer/Cheerio based scraping
- PM2 for production runtime

## Repository Layout

- `apps/web`: public frontend Next.js app, served on port 3000.
- `apps/cms`: CMS backend Next.js app, served on port 3100.
- `src/features/public`: public frontend route implementations, components, data loaders, and public actions.
- `src/features/cms`: CMS route implementations, components, data loaders, and admin server actions. Mutating admin actions should require admin session validation.
- `src/features/shared`: shared route implementations, data, and components used by both apps.
- `src/components`: shared UI components.
- `packages/db`: Drizzle schema, database client, and DB helper APIs.
- `packages/core`: reusable core utilities.
- `src/server/auth`: server-side authentication/session helpers.
- `src/server/cache`: cache tag/revalidation helpers.
- `src/server/scrape`: scraping implementation.
- `src/lib`: shared utilities.
- `drizzle`: database migrations.
- `public`: static assets.

## Commands

Use npm scripts unless the user explicitly asks for another package manager.

```bash
npm run dev
npm run dev:web
npm run dev:cms
npm run dev:webpack
npm run build
npm run start
npm run preview
npm run lint
npm run lint:fix
npm run typecheck
npm run check
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:studio
npm run db:seed
```

Recommended verification after code changes:

```bash
npm run typecheck
npm run lint
SKIP_ENV_VALIDATION=1 npm run build
```

Only use `SKIP_ENV_VALIDATION=1` for local build verification when required environment variables are not present in the shell. Real production builds should have complete production environment variables.

## Environment

Required environment variables include:

- `DATABASE_URL`
- `NEXT_PUBLIC_URL`

Optional behavior flags:

- `ENABLE_PUBLIC_SIGNUP=true` enables the public signup endpoint. Without this value, public signup is closed.

Do not commit secrets. Local `.env*` files may exist in the working tree; treat them as user-owned configuration.

## Design Rules

- 深模块 (Design Deep Modules)
- 消除错误（Define Errors Out of Existence）
- 向下沉淀复杂性 （Pull Complexity Downwards）
- 不同层不同抽象（Different Layer, Different Abstraction)

## Deployment

This project uses GitHub Actions for deployment.

Deployment model:

1. Build and package artifacts via GitHub Actions CI/CD workflow.
2. Upload artifacts to the server.
3. Run or restart with PM2 using `ecosystem.config.cjs`.

For database changes, create migrations with `npm run db:generate` and apply them with `npm run db:migrate`. Coordinate migration execution with deployment.

## Coding Rules

- Prefer existing project patterns over new abstractions.
- Keep changes scoped to the user request.
- Do not revert unrelated dirty worktree changes.
- Use TypeScript types from the codebase instead of broad `any`.
- Use structured parsers/helpers for content, URLs, and HTML when available.
- For admin mutations, call `requireAdminSession()` or the existing auth helper before touching protected data.
- When changing content that affects public pages, revalidate the relevant cache tags through `src/server/cache`.
- Keep route handlers from leaking raw server errors to clients.
- Avoid adding deploy-time side effects to `postinstall`; database generation/migration should be explicit.

## Database Notes

- Schema source: `packages/db/schema.ts`.
- Migration output: `drizzle`.
- Drizzle config: `drizzle.config.ts`.
- Maintain foreign keys and indexes in schema plus generated migrations.
- Do not use `db:push` on production unless the user explicitly chooses that workflow.

## Frontend Notes

- Use existing shadcn/Radix UI components where possible.
- Match existing Tailwind styling and layout conventions.
- Public content pages should return `notFound()` for missing published content rather than rendering permanent loading states.
- Prefer slug-based URLs for public taxonomy/content links.
- Public multilingual routes convention: use default root path (`/`) for the primary Chinese content and `/en/` prefix for English content.

## Auth Notes

- Login sets an HTTP-only session cookie.
- Admin pages/actions should rely on server-side session validation.
- Public signup is disabled by default and gated by `ENABLE_PUBLIC_SIGNUP=true`.

## Git And Worktree Safety

- The worktree may contain user changes. Inspect before editing, and do not reset, checkout, or remove unrelated files.
- Do not use destructive commands such as `git reset --hard` unless the user explicitly asks for them.
- If committing, include only files relevant to the task unless the user asks otherwise.
