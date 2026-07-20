type UnknownRecord = Record<string, unknown>;

export type NormalizedAdminMutationFailure = {
  title: string;
  description?: string;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : null;
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function joinDescription(
  title: string,
  parts: Array<string | null | undefined>,
) {
  const uniqueParts = parts.filter(
    (part, index, values): part is string =>
      Boolean(part) && part !== title && values.indexOf(part) === index,
  );
  return uniqueParts.length > 0 ? uniqueParts.join(" · ") : undefined;
}

export function normalizeAdminMutationFailure(
  result: unknown,
  input: { title?: string; suggestion?: string } = {},
): NormalizedAdminMutationFailure | null {
  const record = asRecord(result);
  if (!record || (record.success !== false && !record.error)) {
    return null;
  }

  const errorRecord = asRecord(record.error);
  const actionError = asRecord(record.actionError) ?? errorRecord;
  const errorText = asText(record.error);
  const title =
    asText(input.title) ??
    asText(actionError?.title) ??
    asText(record.errorTitle) ??
    errorText ??
    "操作失败";
  const message =
    asText(actionError?.message) ??
    asText(record.message) ??
    asText(errorRecord?.message) ??
    errorText;
  const suggestion =
    asText(actionError?.suggestion) ??
    asText(errorRecord?.suggestion) ??
    asText(input.suggestion);

  return {
    title,
    description: joinDescription(title, [message, suggestion]),
  };
}

export function normalizeAdminMutationError(
  error: unknown,
  input: { title?: string; suggestion?: string } = {},
): NormalizedAdminMutationFailure {
  const errorRecord = asRecord(error);
  const message =
    error instanceof Error
      ? error.message
      : (asText(error) ?? asText(errorRecord?.message) ?? "请求未完成");
  const title = asText(input.title) ?? asText(errorRecord?.title) ?? "操作失败";

  return {
    title,
    description: joinDescription(title, [message, asText(input.suggestion)]),
  };
}

export function updatePendingAdminMutationKeys(
  current: ReadonlySet<string>,
  key: string,
  pending: boolean,
): ReadonlySet<string> {
  if (current.has(key) === pending) return current;

  const next = new Set(current);
  if (pending) {
    next.add(key);
  } else {
    next.delete(key);
  }
  return next;
}
