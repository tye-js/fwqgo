import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

const root = process.cwd();
const packagesRoot = path.join(root, "packages");
const srcRoot = path.join(root, "src");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const retiredModules = [
  "packages/ai/rewrite-task-runner.ts",
  "packages/ai/source-site-puller.ts",
  "packages/db/post-tags.ts",
  "packages/scrape/affiliate-link-rewriter.ts",
  "packages/scrape/article-scraper.ts",
  "src/server/offers/import-task-runner.ts",
];
const retiredSchemaExports = [
  "accounts",
  "homepagePromotedPosts",
  "serverOfferImportTasks",
  "verificationTokens",
];

/** @param {string} directory */
function listSourceFiles(directory) {
  /** @type {string[]} */
  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(target));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(target);
    }
  }

  return files;
}

/** @param {import("typescript").SourceFile} sourceFile */
function collectModuleSpecifiers(sourceFile) {
  /** @type {{ value: string; line: number }[]} */
  const specifiers = [];

  /** @param {import("typescript").Node} node */
  function visit(node) {
    let literal;

    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      literal = node.moduleSpecifier;
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      literal = node.moduleReference.expression;
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const argument = node.arguments[0];
      if (
        argument &&
        ts.isStringLiteralLike(argument) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      ) {
        literal = argument;
      }
    }

    if (literal) {
      const line = sourceFile.getLineAndCharacterOfPosition(literal.getStart()).line + 1;
      specifiers.push({ value: literal.text, line });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

/** @param {string} filePath @param {string} specifier */
function resolvesIntoSrc(filePath, specifier) {
  if (specifier === "@" || specifier.startsWith("@/")) return true;
  if (specifier === "src" || specifier.startsWith("src/")) return true;
  if (!specifier.startsWith(".")) return false;

  const resolved = path.resolve(path.dirname(filePath), specifier);
  return resolved === srcRoot || resolved.startsWith(srcRoot + path.sep);
}

/** @param {import("typescript").SourceFile} sourceFile */
function getExportedVariableNames(sourceFile) {
  const names = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const isExported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!isExported) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
    }
  }

  return names;
}

/** @type {string[]} */
const violations = [];
const packageFiles = listSourceFiles(packagesRoot);

for (const filePath of packageFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
  );

  for (const specifier of collectModuleSpecifiers(sourceFile)) {
    if (resolvesIntoSrc(filePath, specifier.value)) {
      violations.push(
        `${path.relative(root, filePath)}:${specifier.line} imports application layer ${specifier.value}`,
      );
    }
  }
}

for (const relativePath of retiredModules) {
  if (fs.existsSync(path.join(root, relativePath))) {
    violations.push(`${relativePath} is a retired compatibility module`);
  }
}

const schemaPath = path.join(root, "packages/db/schema.ts");
const schemaSource = fs.readFileSync(schemaPath, "utf8");
const schemaFile = ts.createSourceFile(
  schemaPath,
  schemaSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const schemaExports = getExportedVariableNames(schemaFile);

for (const exportName of retiredSchemaExports) {
  if (schemaExports.has(exportName)) {
    violations.push(`packages/db/schema.ts re-exports retired entity ${exportName}`);
  }
}

if (violations.length > 0) {
  throw new Error(`Architecture boundary violations:\n${violations.join("\n")}`);
}

console.log(
  `Architecture boundaries verified: ${packageFiles.length} package modules, ${retiredModules.length} retired modules`,
);
