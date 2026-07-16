export type DateValue = Date | string | number | null | undefined;

export function parseDateValue(value: DateValue) {
  if (value === null || value === undefined) return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getLatestDateValue(values: Iterable<DateValue>) {
  let latest: Date | null = null;

  for (const value of values) {
    const date = parseDateValue(value);
    if (date && (!latest || date.getTime() > latest.getTime())) {
      latest = date;
    }
  }

  return latest;
}
