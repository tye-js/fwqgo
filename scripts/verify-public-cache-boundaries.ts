import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const requirements = new Map<string, string[]>([
  [
    "src/features/public/data/post.ts",
    [
      "getPublishedPostCountByCategoryId",
      "getHomepagePostsWithTags",
      "getHomepageSidebarData",
      "getPostBySlug",
      "getPostWithTagsBySlug",
      "getEnglishPostWithTagsBySlug",
      "getPostsWithTagsByCategoryId",
      "getLatestPostsForSidebar",
    ],
  ],
  [
    "src/features/public/data/tag.ts",
    ["getTagBySlug", "getPostsWithTagsByTagSlug"],
  ],
  [
    "src/features/shared/data/category.ts",
    ["getCategories", "getCategoryBySlug"],
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
      "searchServerOffers",
      "getServerOffersByKeywords",
    ],
  ],
  [
    "src/server/homepage/homepage-slots.ts",
    ["getActiveHomepageSlots"],
  ],
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

function inspectCacheStrategy(fn: ts.FunctionDeclaration, sourceFile: ts.SourceFile) {
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
  }
}

for (const relativePath of staticRouteRequirements) {
  const sourceFile = readSourceFile(relativePath);
  if (sourceFile.getFullText().includes("connection(")) {
    errors.push(`${relativePath} must keep its public data behind cached loaders`);
  }
}

for (const relativePath of partialRuntimeRouteRequirements) {
  const sourceFile = readSourceFile(relativePath);
  const sourceText = sourceFile.getFullText();
  if (!sourceText.includes("connection(")) {
    errors.push(`${relativePath} must postpone runtime data with connection()`);
  }
  if (!sourceText.includes("<Suspense")) {
    errors.push(`${relativePath} must place runtime data behind Suspense`);
  }
}

if (errors.length > 0) {
  throw new Error(
    `Public cache boundary verification failed:\n${errors.join("\n")}`,
  );
}

console.log(
  `Public cache boundaries verified: cachedFunctions=${checkedFunctions}, staticRoutes=${staticRouteRequirements.length}, pprRoutes=${partialRuntimeRouteRequirements.length}`,
);
