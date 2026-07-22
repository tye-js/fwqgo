import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const actionDirectory = path.join(root, "src/features/cms/actions");
const cmsApiDirectory = path.join(root, "src/features/cms/routes/api");
const publicDirectories = [
  path.join(root, "src/features/public"),
  path.join(root, "apps/web"),
];
const actionGuardExceptions = new Map([
  [
    "validate-session.ts:validateSession",
    "compares the supplied id with the HTTP-only cookie before reading the session",
  ],
]);

function fail(messages: string[]): never {
  throw new Error(
    `Security boundary verification failed:\n${messages.join("\n")}`,
  );
}

function listTypeScriptFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(entryPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

function readSourceFile(filePath: string) {
  return ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
  return Boolean(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === kind),
  );
}

function exportedAsyncFunctions(sourceFile: ts.SourceFile) {
  return sourceFile.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      Boolean(statement.name) &&
      Boolean(statement.body) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
      hasModifier(statement, ts.SyntaxKind.AsyncKeyword),
  );
}

function hasUseServerDirective(sourceFile: ts.SourceFile) {
  const first = sourceFile.statements[0];
  return Boolean(
    first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use server",
  );
}

function definedAdminActionNames(sourceFile: ts.SourceFile) {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        !declaration.initializer ||
        !ts.isCallExpression(declaration.initializer) ||
        !ts.isIdentifier(declaration.initializer.expression) ||
        declaration.initializer.expression.text !== "defineAdminAction"
      ) {
        continue;
      }
      names.add(declaration.name.text);
    }
  }
  return names;
}

function callsDefinedAdminAction(
  node: ts.Node,
  actionNames: ReadonlySet<string>,
) {
  let found = false;
  function visit(child: ts.Node) {
    if (
      ts.isCallExpression(child) &&
      ts.isIdentifier(child.expression) &&
      actionNames.has(child.expression.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

function verifyCmsActions(errors: string[]) {
  let checkedFunctions = 0;

  for (const filePath of listTypeScriptFiles(actionDirectory)) {
    const sourceFile = readSourceFile(filePath);
    const functions = exportedAsyncFunctions(sourceFile);
    const protectedActionNames = definedAdminActionNames(sourceFile);
    if (functions.length === 0) continue;

    if (!hasUseServerDirective(sourceFile)) {
      errors.push(
        `${path.relative(root, filePath)} must start with "use server"`,
      );
    }

    for (const fn of functions) {
      checkedFunctions += 1;
      const functionName = fn.name?.text ?? "anonymous";
      const exceptionKey = `${path.basename(filePath)}:${functionName}`;
      if (actionGuardExceptions.has(exceptionKey)) continue;

      const body = fn.body?.getText(sourceFile) ?? "";
      if (
        !body.includes("requireAdminSession(") &&
        !callsDefinedAdminAction(fn, protectedActionNames)
      ) {
        errors.push(
          path.relative(root, filePath) +
            ":" +
            functionName +
            " is missing requireAdminSession() or defineAdminAction() delegation",
        );
      }
    }
  }

  return checkedFunctions;
}

function verifyCmsApiRoutes(errors: string[]) {
  let checkedRoutes = 0;

  for (const filePath of listTypeScriptFiles(cmsApiDirectory)) {
    if (!filePath.endsWith(`${path.sep}route.ts`)) continue;
    const relativePath = path.relative(cmsApiDirectory, filePath);
    if (relativePath.startsWith(`auth${path.sep}`)) continue;

    const sourceFile = readSourceFile(filePath);
    for (const fn of exportedAsyncFunctions(sourceFile)) {
      checkedRoutes += 1;
      const body = fn.body?.getText(sourceFile) ?? "";
      if (!body.includes("requireAdminSession(")) {
        errors.push(
          `${path.relative(root, filePath)}:${fn.name?.text ?? "handler"} is missing requireAdminSession()`,
        );
      }
    }
  }

  return checkedRoutes;
}

function verifyPublicDatabaseImports(errors: string[]) {
  let checkedFiles = 0;

  for (const directory of publicDirectories) {
    for (const filePath of listTypeScriptFiles(directory)) {
      const sourceFile = readSourceFile(filePath);
      checkedFiles += 1;

      for (const statement of sourceFile.statements) {
        if (
          !ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier) ||
          statement.moduleSpecifier.text !== "@fwqgo/db"
        ) {
          continue;
        }

        const names =
          statement.importClause?.namedBindings &&
          ts.isNamedImports(statement.importClause.namedBindings)
            ? statement.importClause.namedBindings.elements.map(
                (element) => element.name.text,
              )
            : [];
        const isViewMutation = filePath.endsWith(
          path.join("public", "actions", "post-views.ts"),
        );
        const allowedNames = new Set(
          isViewMutation ? ["analyticsDb"] : ["readDb"],
        );
        const invalidNames = names.filter((name) => !allowedNames.has(name));

        if (invalidNames.length > 0) {
          errors.push(
            `${path.relative(root, filePath)} imports disallowed public database clients: ${invalidNames.join(", ")}`,
          );
        }
      }
    }
  }

  return checkedFiles;
}

function verifyPublicRevalidationRoute(errors: string[]) {
  const filePath = path.join(
    root,
    "src/features/public/routes/api/internal/revalidate/route.ts",
  );
  const source = fs.readFileSync(filePath, "utf8");
  for (const requiredText of [
    "WEB_REVALIDATION_SECRET",
    "timingSafeEqual",
    "publicCacheEvents",
    "MAX_BODY_BYTES",
  ]) {
    if (!source.includes(requiredText)) {
      errors.push(
        `${path.relative(root, filePath)} is missing ${requiredText}`,
      );
    }
  }
  return 1;
}

const errors: string[] = [];
const actionCount = verifyCmsActions(errors);
const apiCount = verifyCmsApiRoutes(errors);
const publicFileCount = verifyPublicDatabaseImports(errors);
const internalRouteCount = verifyPublicRevalidationRoute(errors);

if (errors.length > 0) fail(errors);

console.log(
  `Security boundaries verified: cmsActions=${actionCount}, protectedCmsRoutes=${apiCount}, publicFiles=${publicFileCount}, protectedInternalRoutes=${internalRouteCount}`,
);
