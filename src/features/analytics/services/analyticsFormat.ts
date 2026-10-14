const pad = (n: number) => String(n).padStart(2, "0");

/** Local time as yyyy-MM-dd HH:mm:ss (the viewer's browser time zone). */
export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Numbers with fixed decimals when configured, otherwise up to 2. */
export function formatValue(
  value: unknown,
  decimals?: number | null,
  unit?: string,
): string {
  if (value == null || value === "") return "–";
  if (typeof value !== "number" || !Number.isFinite(value))
    return String(value);
  const text = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 2,
  }).format(value);
  return unit ? `${text} ${unit}` : text;
}

/** ISO string <-> value for <input type="datetime-local"> in local time. */
export function isoToLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
export function localInputToIso(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
