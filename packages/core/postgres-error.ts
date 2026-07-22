const MAX_ERROR_CAUSE_DEPTH = 8;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isPostgresUndefinedTableError(
  error: unknown,
  expectedTable?: string,
) {
  const visited = new Set<object>();
  let current = error;

  for (let depth = 0; depth <= MAX_ERROR_CAUSE_DEPTH; depth += 1) {
    if (!current || typeof current !== "object" || visited.has(current)) {
      return false;
    }
    visited.add(current);

    const candidate = current as {
      cause?: unknown;
      code?: unknown;
      message?: unknown;
      table_name?: unknown;
    };
    const tableName =
      typeof candidate.table_name === "string" ? candidate.table_name : null;

    if (candidate.code === "42P01") {
      return !expectedTable || !tableName || tableName === expectedTable;
    }

    if (typeof candidate.message === "string") {
      const relationPattern = expectedTable
        ? new RegExp(
            `relation ["']?(?:public\\.)?${escapeRegExp(expectedTable)}["']? does not exist`,
            "i",
          )
        : /relation ["']?[^"']+["']? does not exist/i;
      if (relationPattern.test(candidate.message)) return true;
    }

    current = candidate.cause;
  }

  return false;
}
