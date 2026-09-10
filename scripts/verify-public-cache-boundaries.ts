import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const requirements = new Map<string, string[]>([
  [
    "src/features/public/data/knowledge.ts",
    ["getPublicKnowledgeCategories", "getCachedKnowledgeBrowseItems"],
  ],
  [
    "src/features/public/data/post.ts",
    [
      "getPublishedPostCountByCategoryId",
      "getPostsWithTags",
      "getHomepagePostsWithTags",
      "getHomepageSidebarData",
      "getPostWithTagsBySlug",
      "getEnglishPostWithTagsBySlug",
      "getPublicPostSeoBySlug",
      "getEnglishPostSeoBySlug",
      "getRecommendedPosts",
      "getPostsWithTagsByCategoryId",
      "getLatestPostsForSidebar",
    ],
  ],
  [
    "src/features/public/data/article-internal-links.ts",
    ["getPublicPostInternalLinks"],
  ],
  [
    "src/features/public/lib/article-presentation.ts",
    ["getChineseArticlePresentation", "getEnglishArticlePresentation"],
  ],
  [
    "src/features/public/data/tag.ts",
    ["getTagBySlug", "getPostsWithTagsByTagSlug"],
  ],
  [
    "src/features/shared/data/category.ts",
    ["getCategories", "getCategoryBySlug", "getNavigationCategories"],
  ],
  ["src/features/shared/data/site-seo.ts", ["getSiteSeoConfig"]],
  [
    "src/server/offers/server-offers.ts",
    [
      "getServerOfferTopic",
      "getServerOfferCollection",
      "getServerOfferCollectionIndex",
      "getServerOfferTopicCounts",
      "getPublicServerOfferCount",
      "getLatestServerOffers",
      "getPublicServerOffers",
      "getServerOffersByKeywords",
      "getRelatedServerOffersForPost",
    ],
  ],
  ["src/server/homepage/homepage-slots.ts", ["getActiveHomepageSlots"]],
]);
const staticRouteRequirements = [
  "src/features/public/routes/servers/providers/[provider]/page.tsx",
  "src/features/public/routes/servers/regions/[region]/page.tsx",
  "src/features/public/routes/servers/lines/[line]/page.tsx",
];
const partialRuntimeRouteRequirements = [
  "src/features/public/routes/page.tsx",
  "src/features/public/routes/en/page.tsx",
  "src/features/public/routes/servers/page.tsx",
  "src/features/public/routes/servers/[topic]/page.tsx",
];
const articleRouteRequirements = [
  {
    app: "apps/web/app/(zh)/fwq/posts/[slug]/page.tsx",
    route: "src/features/public/routes/fwq/posts/[slug]/page.tsx",
    language: "zh",
    presentation: "getChineseArticlePresentation",
  },
  {
    app: "apps/web/app/(en)/en/fwq/posts/[slug]/page.tsx",
    route: "src/features/public/routes/en/fwq/posts/[slug]/page.tsx",
    language: "en",
    presentation: "getEnglishArticlePresentation",
  },
] as const;

function readSourceFile(relativePath: string) {
  const filePath = path.join(root, relativePath);
  return ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function findFunction(sourceFile: ts.SourceFile, name: string) {
  return sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
}

function hasUseCacheDirective(fn: ts.FunctionDeclaration) {
  const first = fn.body?.statements[0];
  return Boolean(
    first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use cache",
  );
}

function inspectCacheStrategy(
  fn: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
) {
  const bodyText = fn.body?.getText(sourceFile) ?? "";
  if (hasUseCacheDirective(fn)) {
    return {
      cached: true,
      tagged: bodyText.includes("tagCache("),
      expiring: true,
    };
  }

  if (bodyText.includes("unstable_cache(")) {
    return {
      cached: true,
      tagged: /\btags\s*:/.test(bodyText),
      expiring: /\brevalidate\s*:/.test(bodyText),
    };
  }

  return { cached: false, tagged: false, expiring: false };
}

const errors: string[] = [];
let checkedFunctions = 0;

for (const [relativePath, functionNames] of requirements) {
  const sourceFile = readSourceFile(relativePath);
  const sourceText = sourceFile.getFullText();
  if (sourceText.includes("connection(")) {
    errors.push(`${relativePath} must not call connection() in the data layer`);
  }

  for (const functionName of functionNames) {
    checkedFunctions += 1;
    const fn = findFunction(sourceFile, functionName);
    if (!fn?.body) {
      errors.push(`${relativePath}:${functionName} was not found`);
      continue;
    }
    const strategy = inspectCacheStrategy(fn, sourceFile);
    if (!strategy.cached) {
      errors.push(
        `${relativePath}:${functionName} must use "use cache" or unstable_cache()`,
      );
    }
    if (!strategy.tagged) {
      errors.push(`${relativePath}:${functionName} must declare cache tags`);
    }
    if (!strategy.expiring) {
      errors.push(
        `${relativePath}:${functionName} unstable_cache() must declare revalidate`,
      );
    }
    // These core caches must preserve the last successful value on DB errors.
    // A returned fallback from a catch block would itself become cacheable data.
    const strictFailures = new Set([
      "getPostsWithTags",
      "getHomepagePostsWithTags",
      "getHomepageSidebarData",
      "getRecommendedPosts",
      "getCategories",
      "getNavigationCategories",
      "getSiteSeoConfig",
      "getActiveHomepageSlots",
      "getServerOfferTopicCounts",
      "getPublicServerOfferCount",
      "getLatestServerOffers",
      "getPublicServerOffers",
      "getServerOffersByKeywords",
    ]);
    if (strictFailures.has(functionName)) {
      const visit = (node: ts.Node) => {
        if (ts.isCatchClause(node)) {
          const last = node.block.statements.at(-1);
          if (!last || !ts.isThrowStatement(last)) {
            errors.push(
              `${relativePath}:${functionName} must throw from cache failure handlers`,
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(fn.body);
    }
  }
}

for (const relativePath of staticRouteRequirements) {
  const sourceFile = readSourceFile(relativePath);
  if (sourceFile.getFullText().includes("connection(")) {
    errors.push(
      `${relativePath} must keep its public data behind cached loaders`,
    );
  }
}

for (const relativePath of partialRuntimeRouteRequirements) {
  const sourceFile = readSourceFile(relativePath);
  const sourceText = sourceFile.getFullText();
  if (!sourceText.includes("connection(")) {
    errors.push(`${relativePath} must postpone runtime data with connection()`);
  }
  if (!sourceText.includes("<Suspense") && !sourceText.includes("notFound()")) {
    errors.push(
      `${relativePath} must place runtime data behind Suspense or resolve notFound() before rendering`,
    );
  }
}

const articleStaticParamsSource = fs.readFileSync(
  path.join(root, "src/features/public/lib/article-static-params.ts"),
  "utf8",
);
const articlePresentationSource = fs.readFileSync(
  path.join(root, "src/features/public/lib/article-presentation.ts"),
  "utf8",
);
const postDataSource = fs.readFileSync(
  path.join(root, "src/features/public/data/post.ts"),
  "utf8",
);
if (!articleStaticParamsSource.includes("DEFAULT_PRERENDER_LIMIT = 50")) {
  errors.push("Public article ISR must keep a bounded default hot set");
}
if (
  !articleStaticParamsSource.includes("orderBy(desc(posts.createdAt)") ||
  !articleStaticParamsSource.includes("orderBy(desc(posts.views)")
) {
  errors.push("Public article ISR must select both recent and popular posts");
}
if (
  !articleStaticParamsSource.includes(
    "PUBLIC_ARTICLE_STATIC_PARAMS_PLACEHOLDER",
  )
) {
  errors.push(
    "Public article ISR must keep builds safe when the database is absent",
  );
}
if (!articleStaticParamsSource.includes('SKIP_ENV_VALIDATION === "1"')) {
  errors.push("Local builds must not wait for a production article database");
}
for (const timingField of [
  "postReadMs",
  "internalLinksReadMs",
  "contentRenderMs",
]) {
  if (!articlePresentationSource.includes(timingField)) {
    errors.push(`Article slow logs must include ${timingField}`);
  }
}
if (
  !articlePresentationSource.includes("readPublicPostInternalLinks") ||
  !articlePresentationSource.includes("content: post.content")
) {
  errors.push(
    "Article presentation must reuse the loaded body for link hashing",
  );
}
for (const errorMessage of [
  "获取文章 SEO 信息失败",
  "获取英文文章 SEO 信息失败",
  "通过slug获取文章失败",
  "通过英文 slug 获取文章失败",
]) {
  if (!postDataSource.includes(`throw new Error("${errorMessage}"`)) {
    errors.push(`Article data errors must escape the cache: ${errorMessage}`);
  }
}

for (const requirement of articleRouteRequirements) {
  const appSource = fs.readFileSync(path.join(root, requirement.app), "utf8");
  const routeSource = fs.readFileSync(
    path.join(root, requirement.route),
    "utf8",
  );
  if (!appSource.includes("generateStaticParams")) {
    errors.push(`${requirement.app} must export generateStaticParams`);
  }
  if (
    !routeSource.includes(
      `return getPublicArticleStaticParams("${requirement.language}")`,
    )
  ) {
    errors.push(`${requirement.route} must pre-render its language hot set`);
  }
  if (!routeSource.includes(requirement.presentation)) {
    errors.push(
      `${requirement.route} must render the cached article presentation`,
    );
  }
  if (!routeSource.includes("<Suspense fallback={null}>")) {
    errors.push(
      `${requirement.route} must keep offers below a Suspense boundary`,
    );
  }
}

const webNextConfig = fs.readFileSync(
  path.join(root, "apps/web/next.config.js"),
  "utf8",
);
if (!webNextConfig.includes("partialPrefetching: true")) {
  errors.push("Web must enable partialPrefetching for on-demand article ISR");
}

const webProxySource = fs.readFileSync(
  path.join(root, "apps/web/proxy.ts"),
  "utf8",
);
if (
  !webProxySource.includes("ARTICLE_STATIC_SHELL_PATHS") ||
  !webProxySource.includes('"X-Robots-Tag": "noindex, nofollow, noarchive"') ||
  !webProxySource.includes("status: 404")
) {
  errors.push("The article build placeholder must return a real noindex 404");
}
const routePolicy = fs.readFileSync(
  path.join(root, "packages/core/public-route-policy.ts"),
  "utf8",
);
for (const bypass of [
  "rsc",
  "next-router-prefetch",
  "next-router-segment-prefetch",
  "next-router-state-tree",
  "cookie",
  "authorization",
]) {
  if (!routePolicy.includes(`"${bypass}"`)) {
    errors.push(`Public article cache policy must bypass ${bypass}`);
  }
}
if (!webProxySource.includes("isPublicHtmlRequest(request)")) {
  errors.push("The proxy must apply the shared HTML cache boundary");
}
if (
  webNextConfig.includes("publicArticleCacheHeaders") ||
  webNextConfig.includes('key: "CDN-Cache-Control"')
) {
  errors.push(
    "Path-only headers must never cache article 404 or 5xx responses",
  );
}

if (errors.length > 0) {
  throw new Error(
    `Public cache boundary verification failed:\n${errors.join("\n")}`,
  );
}

console.log(
  `Public cache boundaries verified: cachedFunctions=${checkedFunctions}, staticRoutes=${staticRouteRequirements.length}, pprRoutes=${partialRuntimeRouteRequirements.length}, articleIsrRoutes=${articleRouteRequirements.length}`,
);
