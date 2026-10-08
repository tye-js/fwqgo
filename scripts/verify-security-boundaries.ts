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

/**
 * 收集 `withAdminAudit(definition, impl)` 形式的 action，以及它委托的 impl 函数名。
 *
 * `withAdminAudit`（`lib/admin-audit.ts`）**只补审计日志，不做鉴权**——它的约定是
 * `run` 必须在函数体内自己调 `requireAdminSession()`。而这类 action 写成
 * `export const x = withAdminAudit({...}, xImpl)`，不是 `export async function`，
 * 所以 `exportedAsyncFunctions` 那一圈根本看不到它们：门禁此前对它们完全无感。
 *
 * 这里把委托关系解析出来，让检查能穿透包装器看到真正的实现体。
 */
function adminAuditDelegations(
  sourceFile: ts.SourceFile,
): Array<{ action: string; impl: string }> {
  const delegations: Array<{ action: string; impl: string }> = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        !declaration.initializer ||
        !ts.isCallExpression(declaration.initializer) ||
        !ts.isIdentifier(declaration.initializer.expression) ||
        declaration.initializer.expression.text !== "withAdminAudit"
      ) {
        continue;
      }
      // 第二个实参是 impl 标识符；内联函数体无法按名字追查，交由下面按需检查函数体。
      const implArgument = declaration.initializer.arguments[1];
      if (implArgument && ts.isIdentifier(implArgument)) {
        delegations.push({
          action: declaration.name.text,
          impl: implArgument.text,
        });
      }
    }
  }
  return delegations;
}

function functionBodyText(
  sourceFile: ts.SourceFile,
  name: string,
): string | null {
  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement)) continue;
    if (statement.name?.text !== name) continue;
    return statement.body?.getText(sourceFile) ?? null;
  }
  return null;
}

function verifyCmsActions(errors: string[]) {
  let checkedFunctions = 0;

  for (const filePath of listTypeScriptFiles(actionDirectory)) {
    const sourceFile = readSourceFile(filePath);
    const functions = exportedAsyncFunctions(sourceFile);
    const protectedActionNames = definedAdminActionNames(sourceFile);
    // withAdminAudit 包装的 action 不是 `export async function`，所以有些文件
    // （例如 actions/tag.ts）的 exportedAsyncFunctions 结果为空。这类文件里的
    // action 同样必须被检查，因此不能在这里提前跳过。
    const delegations = adminAuditDelegations(sourceFile);
    if (functions.length === 0 && delegations.length === 0) continue;

    if (functions.length > 0 && !hasUseServerDirective(sourceFile)) {
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

    // withAdminAudit 包装的 action：逐个确认它委托的 impl 自己鉴权。
    for (const { action, impl } of delegations) {
      checkedFunctions += 1;
      const relative = path.relative(root, filePath);
      const exceptionKey = `${path.basename(filePath)}:${impl}`;
      if (actionGuardExceptions.has(exceptionKey)) continue;

      const implBody = functionBodyText(sourceFile, impl);
      if (implBody === null) {
        errors.push(
          `${relative}:${action} 委托的 ${impl} 不是本文件内的函数声明，无法确认它调用了 requireAdminSession()`,
        );
        continue;
      }
      if (!implBody.includes("requireAdminSession(")) {
        errors.push(
          `${relative}:${action} 经 withAdminAudit 包装，但 ${impl}() 内没有 requireAdminSession()——该包装器只补审计，不做鉴权`,
        );
      }
    }
  }

  return checkedFunctions;
}

function verifyCmsApiRoutes(errors: string[]) {
  let checkedRoutes = 0;

  // 这里曾有一条例外：body 里出现 `ingestNetworkMeasurementBatch(` /
  // `pullNetworkMeasurementTask(` 就跳过鉴权检查。那两个函数在仓库里并不存在，
  // 例外本身是死代码；而 `body.includes()` 是纯子串匹配——将来有人在 route
  // handler 的注释里提到这两个名字，鉴权检查就会被静默跳过。已删除：需要例外时
  // 请像上面 `actionGuardExceptions` 那样登记成 `文件:handler` 精确键，并写明理由。
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

function verifyProviderCmsLoaders(errors: string[]) {
  const sourceFile = readSourceFile(
    path.join(root, "src/server/offers/provider-monitor.ts"),
  );
  const loaders = new Set([
    "getProviderMonitorList",
    "getProviderMonitorCheckHistory",
    "getProviderOptionsForMonitoring",
    "getProviderMonitorRunHistory",
    "getProviderOfferCandidateList",
    "getProviderOfferCandidateCount",
    "getProviderOfferCandidatePage",
  ]);
  let checked = 0;
  for (const fn of exportedAsyncFunctions(sourceFile)) {
    if (!loaders.has(fn.name?.text ?? "")) continue;
    checked++;
    if (
      !fn.body?.statements[0]
        ?.getText(sourceFile)
        .includes("requireAdminSession(")
    ) {
      errors.push(
        `Provider CMS loader ${fn.name?.text} must authenticate before querying`,
      );
    }
  }
  if (checked !== loaders.size)
    errors.push("A protected provider CMS loader is missing");
}

const errors: string[] = [];
const actionCount = verifyCmsActions(errors);
const apiCount = verifyCmsApiRoutes(errors);
const publicFileCount = verifyPublicDatabaseImports(errors);
const internalRouteCount = verifyPublicRevalidationRoute(errors);
verifyProviderCmsLoaders(errors);

if (errors.length > 0) fail(errors);

console.log(
  `Security boundaries verified: cmsActions=${actionCount}, protectedCmsRoutes=${apiCount}, publicFiles=${publicFileCount}, protectedInternalRoutes=${internalRouteCount}`,
);
