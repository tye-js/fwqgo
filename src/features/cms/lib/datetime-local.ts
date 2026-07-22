export function formatDateTimeLocalValue(
  value: Date | null | undefined,
) {
  if (!value || Number.isNaN(value.getTime())) return "";
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export function serializeDateTimeLocalValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;

  const normalized = value.trim();
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? normalized : parsed.toISOString();
}
