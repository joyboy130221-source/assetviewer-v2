export type QueryParameter = { key: string; value: string };
export type LegacyQueryParameters = Record<string, string>;
export type QueryParameters = QueryParameter[] | LegacyQueryParameters;

export function normalizeQueryParameters(
  value?: QueryParameters | null,
): QueryParameter[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter(
        (entry): entry is QueryParameter =>
          Boolean(entry) && typeof entry.key === "string",
      )
      .map((entry) => ({ key: entry.key, value: String(entry.value ?? "") }));
  }
  return Object.entries(value).map(([key, entryValue]) => ({
    key,
    value: String(entryValue ?? ""),
  }));
}

export function compactQueryParameters(
  rows: QueryParameter[],
): QueryParameter[] {
  return rows
    .map((row) => ({ key: row.key.trim(), value: row.value }))
    .filter((row) => Boolean(row.key));
}
