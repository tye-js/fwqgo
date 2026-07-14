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
      "getServerOfferTopicCounts",
      "getPublicServerOfferCount",
      "getLatestServerOffers",
      "getPublicServerOffers",
      "searchServerOffers",
      "getServerOffersByKeywords",
    ],
  ],
]);

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
    if (!hasUseCacheDirective(fn)) {
      errors.push(
        `${relativePath}:${functionName} must start with "use cache"`,
      );
    }
    if (!fn.body.getText(sourceFile).includes("tagCache(")) {
      errors.push(`${relativePath}:${functionName} must declare cache tags`);
    }
  }
}

if (errors.length > 0) {
  throw new Error(
    `Public cache boundary verification failed:\n${errors.join("\n")}`,
  );
}

console.log(
  `Public cache boundaries verified: cachedFunctions=${checkedFunctions}`,
);
