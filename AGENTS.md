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
npm run db:migrate:prod
npm run db:push
npm run db:studio
npm run db:seed
```

Recommended verification after code changes:

```bash
npm run lint
npm run typecheck
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
3. Run production migrations with `scripts/migrate-prod.mjs`.
4. Run or restart with PM2 using `ecosystem.config.cjs`.

For database changes, create migrations with `npm run db:generate` and apply them with `npm run db:migrate`. Coordinate migration execution with deployment.

GitHub Actions and `scripts/deploy-local-build.sh` include the production migration step. Keep `scripts/migrate-prod.mjs` and the `drizzle` folder in release payloads.

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
- Before running migrations against an existing or production database, verify both the schema state and the Drizzle migration table. If tables/columns already exist but `__drizzle_migrations` is missing, do not blindly rerun all migrations; create or repair a proper migration baseline first.
- Drizzle columns in this project often use camelCase database names such as `siteName`, `createdAt`, `enName`, and `enSlug`; inspect the schema before writing raw SQL or information-schema checks.

## Frontend Notes

- Use existing shadcn/Radix UI components where possible.
- Match existing Tailwind styling and layout conventions.
- Public content pages should return `notFound()` for missing published content rather than rendering permanent loading states.
- Prefer slug-based URLs for public taxonomy/content links.
- Public multilingual routes convention: use default root path (`/`) for the primary Chinese content and `/en/` prefix for English content.
- Public English pages should use the English route tree, including `/en`, `/en/fwq/posts/[slug]`, `/en/fwq/[category]/page/[pageNo]`, and `/en/fwq/tags/[tagSlug]/page/[pageNo]`.
- Shared public components that render language-specific UI, such as Header, Footer, and article cards, should accept or derive the language and render English labels/links on `/en` pages.
- Category and tag English routes should prefer `enName`/`enSlug` and fall back to Chinese values only when English fields are missing.
- Keep `"use cache"` functions free of request-specific or dynamic arguments. For example, keep cached category reads stable and do language localization outside that cached boundary unless a separate stable cached API is introduced.
- Preserve mobile interaction quality: navigation sheet links should close the sheet after navigation, tappable controls should be at least 44px high where practical, and data tables should not force horizontal page overflow.
- Public article and offer tables should preserve real `href` targets when converting or rendering table-cell content; do not reduce linked cells to plain text.

## CMS Notes

- CMS UI should stay Chinese-first, use existing shadcn/Radix patterns, and show readable Sonner toast feedback for user actions.
- Admin mutations must validate the admin session before touching protected data.
- SEO management includes Chinese and English site SEO, category SEO, and tag SEO. Keep language filters and bilingual fields intact when changing these screens.
- Chinese and English generated posts are separate articles in drafts and article lists. Preserve language filters in list/workbench UI.
- `正文预览` is for the cleaned original body after scraping and cleaning. Do not overwrite it with rewritten output.
- English article generation should translate from the rewritten Chinese article, while English SEO fields should be generated separately.
- Long operational descriptions in CMS headers/workbenches should wrap instead of being line-clamped when they contain instructions.
- Wide admin tables should use internal horizontal scrolling and stable min widths rather than squeezing columns on tablet or desktop.
- Long SEO descriptions should use textareas, not single-line inputs.

## Content And Affiliate Notes

- Affiliate link replacement should first match the merchant from the original affiliate URL, then use that merchant's configured affiliate parameter and value.
- If the merchant `affParam` is `href`, replace the whole URL with the database affiliate URL. Keep this behavior unchanged.
- For normal affiliate parameters, update only that parameter value and preserve the rest of the original URL, query parameters, path, and ordering as much as practical.
- One article corresponds to one merchant in the common workflow; fetch merchant affiliate data once per article when possible, then reuse it for all matching links in that article.
- When converting HTML tables to Markdown or internal article content, preserve links inside table cells, including purchase links with different `href` values per cell.

## AI And Image Notes

- AI rewrite configuration Max Tokens should apply to both Chinese and English generation paths.
- English generation should not be blocked or truncated by state from a previous Chinese rewrite process; treat long-running generation steps as separate tasks with clear readable errors.
- AI cover generation should run in the background when used by automation, with operator-readable error messages.
- Cover naming: English article covers use an `-en` suffix such as `some-slug-en-cover.webp`; Chinese article covers keep the ordinary cover name unless a specific flow requires otherwise.

## Auth Notes

- Login sets an HTTP-only session cookie.
- Admin pages/actions should rely on server-side session validation.
- Public signup is disabled by default and gated by `ENABLE_PUBLIC_SIGNUP=true`.

## Git And Worktree Safety

- The worktree may contain user changes. Inspect before editing, and do not reset, checkout, or remove unrelated files.
- Do not use destructive commands such as `git reset --hard` unless the user explicitly asks for them.
- If committing, include only files relevant to the task unless the user asks otherwise.
