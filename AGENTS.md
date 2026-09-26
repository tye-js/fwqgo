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

Use Bun 1.4.2, pinned by `packageManager` in `package.json`, for dependency installation, development, builds, tests, maintenance scripts, migrations, and the production standalone runtime. Workflows read that pin and run `verify:bun` before installation. Bun 1.3.14 has a native NAPI worker shutdown crash with Next.js 16.3/Turbopack and must not be used for builds. `bunfig.toml` forces package CLIs to run with Bun even when they have a Node shebang. Node.js 24 is only a host dependency of the PM2 process manager; do not add project commands or application fallbacks that execute Node. Preserve Bun-compatible `node:*` imports, `NodeJS` types, and native addons.

```bash
bun run dev
bun run dev:web
bun run dev:cms
bun run build
bun run start
bun run preview
bun run lint
bun run lint:fix
bun run typecheck
bun run check
bun run db:generate
bun run db:migrate
bun run db:migrate:prod
bun run db:push
bun run db:studio
```

Recommended verification after code changes:

```bash
bun run lint
bun run typecheck
SKIP_ENV_VALIDATION=1 bun run build
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

The deployment boundary is: a normal request such as "部署" means finish the work, run the recommended verification, then **commit and push**. Pushing is the expected end of the task, not a separate action that needs its own confirmation — it is what triggers deployment, after which GitHub Actions builds, uploads, runs the production migrations, and restarts PM2.

Do not hand the push back to the user, and do not add a follow-up step afterwards: no polling the workflow run, no re-verifying the deployed site, no cleanup pass. The task is done once the push lands. Commit messages follow the convention used in the repository history — a Chinese declarative sentence with no conventional-commit prefix, e.g. "修复 /servers 聚合链接指向 404：没有规范 slug 的标签改渲染纯文本" — and stage only the files relevant to the task.

Do not run the local Docker deployment script — `scripts/deploy-local-build.sh` is an emergency/manual fallback only. Do not force-push or rewrite already-published history.

Deployment model:

1. Build and package artifacts via GitHub Actions CI/CD workflow.
2. Upload artifacts to the server.
3. Run production migrations with `scripts/migrate-prod.mjs`.
4. Run or restart with PM2 using `ecosystem.config.cjs`.

For database changes, create migrations with `bun run db:generate` and apply them with `bun run db:migrate`. Coordinate migration execution with deployment.

GitHub Actions includes the production migration step. Keep `scripts/migrate-prod.mjs` and the `drizzle` folder in release payloads. `scripts/deploy-local-build.sh` is retained only for an explicitly requested local Docker deployment.

Production releases include Bun 1.4.2 at `bin/bun`. PM2 starts releases with that binary in
`fork` mode and one instance per app; do not switch Bun releases to PM2 `cluster` mode because
PM2's cluster primary is Node-based. The interpreter defaults to the release's `bin/bun`
even when `BUN_BIN` is absent. Deployment and rollback require bundled Bun and both app
artifacts; never silently fall back to Node. Runtime verification must use the same Bun
binary as PM2 will use to launch the applications.

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
- **Desktop dropdown nav panels must not stay open.** The header lives in the root layout, so client-side navigation does not remount it — a native `<details>` left `open` follows the user onto the next page, and clicking elsewhere does nothing. `active-nav-link.tsx` owns the dismissal logic (click inside the panel, pointerdown outside the group, `Escape`, focus leaving the group, route change, and pointer leaving the group); do not re-implement it per call site or drop it when refactoring the header.
- Public article and offer tables should preserve real `href` targets when converting or rendering table-cell content; do not reduce linked cells to plain text.
- **Client components that read URL data (`usePathname`, `useSearchParams`) must sit inside a `<Suspense>` boundary.** The public apps run with `cacheComponents: true`, so reading URL data outside one blocks prerendering and fails the build with `CLIENT_HOOK_DYNAMIC`. Keep the boundary inside the component that needs the hook — give the fallback a non-highlighted rendering — so callers do not have to remember. Examples: `src/features/public/components/active-nav-link.tsx`, and the language switch in `header.tsx`.
- **Write Tailwind class names as complete literals.** `base.replace("left-0", "right-0")` produces a class name Tailwind cannot see, so the style silently disappears; define each variant as its own literal instead.

## Mobile Adaptation Contract

- For 320–1024px, interactive controls remain at least 44px high; do not add `md:min-h-8` or `md:min-h-9` to public controls.
- Use `min-h-dvh`, safe-area insets, and one main scroll container. Page-level horizontal overflow must not be hidden as a workaround.
- URLs, slugs, errors, task sources, prices, and server specifications must wrap or be expandable; only descriptive summaries may be intentionally line-clamped.
- Public server inventory uses cards below `xl` and the desktop table from `xl` upward.
- CMS `Table` owns horizontal scrolling through `TableViewport`; `mobileLabels`/`viewportLabel` are internal UI props and labels must exist in SSR HTML. `cms-mobile-sticky-actions` means card conversion; `cms-table-sticky-actions` means the last column is truly an action column.
- Static verification is not a substitute for real viewport testing. Use `bun run smoke:mobile`; if Chromium or file-descriptor limits prevent it, report the result as real viewport unverified.
- The public route count in mobile verification is an audit sentinel. Legitimate route changes must update the sentinel and its rationale.

## Public Article ISR Contract

- Public article core content uses Next.js 16 Cache Components/ISR. Keep `cacheComponents` and `partialPrefetching` enabled together.
- `generateStaticParams` pre-renders a bounded recent/popular set per language; long-tail published articles remain on-demand ISR. Local builds with `SKIP_ENV_VALIDATION=1` must not require a production database.
- Title, metadata, cover, sanitized body HTML, heading IDs, TOC, and inline links belong to the article core cache. Database failures must throw and must never become a cached HTTP 200 error page.
- View tracking stays client-side. Server offers remain behind their own cache and Suspense boundary so inventory changes do not rebuild the article body.
- Public HTML cache headers must not apply to RSC, route-prefetch, segment-prefetch, or `_rsc` responses. Cloudflare Cache Rules must preserve the same boundary.
- Deploy verification must confirm a recent sitemap article has visible prose in raw HTML, initial-head metadata, unique resume segment IDs, and no public HTML cache policy on RSC prefetches.

## Article Production Contract

- Article collection fetches and cleans source content, replaces merchant affiliate links, then saves the complete body directly to a draft. Never call text AI models or require an enabled rewrite configuration to collect an article.
- The collected draft and task/material completion must commit atomically under the task lease. Retries reuse an existing linked article without overwriting operator edits. New collection tasks end at `succeeded`, not an intermediate manual-entry gate.
- Keep source titles/descriptions as initial draft values; body edits and final SEO fields are maintained in the draft editor. Incomplete SEO/tags must not prevent saving an unpublished draft. Its Markdown toolbar copies the entire current body, including unsaved edits and table links.
- Keep complete cleaned source snapshots separate from manually entered content. Do not truncate them to historical AI token/input limits.
- New collected drafts use `/img/placeholders/fwq-placeholder.png` immediately. Saving must not enqueue image generation or require image credentials. Operators explicitly click the cover generation button to start a background task.
- Chinese article editors expose “生成英文文章”. Explicit requests translate the complete saved Chinese body using the configured text model and save an independent unpublished English article with a bilingual relationship. Keep every table row, image and link; do not overwrite the source or an existing English article. Preserve completed translation checkpoints across retries and reject unfinished output or stale source writes. `assertTranslatedArticleStructure` enforces this: it rejects a translation that changes or drops the source's `a[href]` list, `table tr` count, or `img[src]` list.
- Both language editors expose “生成封面图”. A click queues a background task using the current article description and the language-specific AI image configuration. Saving alone does not generate a cover. On success, replace the cover only if it still matches the one present when requested; preserve a cover changed manually during generation. Failure keeps the current cover. Revalidate public article caches after replacement.
- Historical AI artifacts and configuration fields remain readable. Retrying old collection tasks uses saved source snapshots when available. Retire standalone SEO task queues. Preserve English bulk entry, retries, historical manual forms and bilingual relationships. Only explicitly marked English translation tasks may call text models; never replay historical unmarked tasks or restore Chinese rewriting.

## CMS Notes

- CMS UI should stay Chinese-first, use existing shadcn/Radix patterns, and show readable Sonner toast feedback for user actions.
- Admin mutations must validate the admin session before touching protected data.
- SEO management includes Chinese and English site SEO, category SEO, and tag SEO. Keep language filters and bilingual fields intact when changing these screens.
- Chinese and English generated posts are separate articles in drafts and article lists. Preserve language filters in list/workbench UI.
- `正文预览` is for the cleaned original body after scraping and cleaning. Do not overwrite it with rewritten output.
- English translation tasks retain the complete Chinese source snapshot and translate its body, title and description into an independent draft. Final English body and SEO fields remain editable. Historical manual English tasks retain their input forms; existing English articles provide an editing link and must never be overwritten automatically.
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

- Article collection and manual saves must work without text AI credentials. Keep model configuration for independent AI features and historical records separate from the manual article workflow.
- AI cover generation should run in the background when used by automation, with operator-readable error messages.
- Cover naming: Chinese article covers use a `-zh` suffix such as `some-slug-zh-cover.webp`; English article covers use an `-en` suffix such as `some-slug-en-cover.webp`.
- Body images use Markdown image syntax only: `![alt](/uploads/name.webp "caption")`. The caption rides in the `title` slot and must not contain a double quote. Raw HTML is not an option — the Markdown renderer escapes it (`escapeHtml` in `packages/core/content.ts`), so `<img>` in a body becomes literal text. The syntax lives in one dependency-free module, `packages/core/article-image-syntax.ts`, shared by the editor and the HTML→Markdown converter; `packages/core/content.ts` pulls in cheerio and marked and must not be imported by client components.
- Sanitization accepts same-origin `/uploads/` sources only, and only a `?v=` query. Third-party and absolute same-origin URLs are dropped: `next.config.js` `images.remotePatterns` cannot serve them, so they would ship at full resolution. The scraper therefore passes `images: "drop"` and never writes source-site images into a body.
- Body images must render through the `next/image` optimizer. The body is a `dangerouslySetInnerHTML` string, so `optimizeArticleImages` (`src/features/public/lib/article-images.ts`) writes the `/_next/image` URL, `srcset` and `sizes` by hand and injects the real width/height from `imageAssets`. Every path that calls `renderArticleContentHtml` must also apply it — `scripts/verify-public-images.ts` scans for that. `srcset` widths must come from `deviceSizes ∪ imageSizes`, because production `/_next/image` rejects any other `w` with a 400.
- AI rewriting protects body images as their own placeholder kind (`kind: "image"` in `packages/ai/rewrite-quality.ts`). The image pattern must be matched and replaced before the link pattern: `[alt](url)` is a substring of `![alt](url)`, so link-first ordering strands the `!` and silently downgrades the image to a text link.
- Body images enter the body through the editor's “插入图片” dialog only — from a local upload or the image library — and screenshots can be pasted straight into the body textarea. Paste uploads through the same `/api/upload` (WebP conversion, variants, content-hash dedup) and then opens that same dialog with the image pending, so the operator confirms the alt text and caption before anything is written to the body. Never insert an image into the body without that confirmation step. The upload path is shared by both entry points in `src/features/cms/lib/article-image-upload.ts`; do not reimplement its validation or upload call.
- Paste must only intercept image clipboard data: check for an image first and let plain-text paste fall through to the browser default, otherwise text can no longer be pasted into the body. `scripts/verify-ai-rewrite-prompts.ts` asserts that ordering.
- The CMS never renders body HTML, so the article editor also shows a body-image list (thumbnails plus alt and caption, click to locate the syntax in the textarea) next to the Markdown field. It flags images that the front end will drop. Extend it when a new body element type is added, otherwise operators cannot see what they inserted without publishing.

## Auth Notes

- Login sets an HTTP-only session cookie.
- Admin pages/actions should rely on server-side session validation.
- Public signup is disabled by default and gated by `ENABLE_PUBLIC_SIGNUP=true`.

## Git And Worktree Safety

- The worktree may contain user changes. Inspect before editing, and do not reset, checkout, or remove unrelated files.
- Do not use destructive commands such as `git reset --hard` unless the user explicitly asks for them.
- If committing, include only files relevant to the task unless the user asks otherwise.
