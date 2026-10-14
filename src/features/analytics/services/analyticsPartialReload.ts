import type {
  AnalyticsResult,
  AnalyticsRuntimeInput,
  TimeSeriesResult,
} from "../model/analytics.types";

/**
 * Partial reloads: when only measures' own toolbar values changed, only those
 * measures are fetched again and merged into the result, so every other
 * chart keeps its data, its zoom and stays interactive.
 */

/** The input without per-measure parts and request flags. */
function sharedPart(input: AnalyticsRuntimeInput) {
  const { measures: _m, fresh: _f, only: _o, ...shared } = input;
  return JSON.stringify(shared);
}

/**
 * Measure ids whose own input changed, or null when the shared input changed
 * (which needs a full reload). An empty list means nothing server-side changed.
 */
export function changedMeasures(
  previous: AnalyticsRuntimeInput,
  next: AnalyticsRuntimeInput,
): string[] | null {
  if (sharedPart(previous) !== sharedPart(next)) return null;
  const before = previous.measures ?? {};
  const after = next.measures ?? {};
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...ids].filter(
    (id) =>
      JSON.stringify(before[id] ?? null) !== JSON.stringify(after[id] ?? null),
  );
}

/**
 * Replaces the given measures' series. Untouched series keep their object
 * identity, so their charts are not redrawn.
 */
export function mergeSeries(
  result: AnalyticsResult,
  incoming: TimeSeriesResult[],
  ids: Iterable<string>,
): AnalyticsResult {
  const accepted = new Set(ids);
  const byId = new Map(
    incoming.filter((s) => accepted.has(s.id)).map((s) => [s.id, s]),
  );
  if (!byId.size || !result.series) return result;
  return {
    ...result,
    series: result.series.map((s) => byId.get(s.id) ?? s),
  };
}

/** Shows a failed partial reload on the affected charts only. */
export function failSeries(
  result: AnalyticsResult,
  ids: Iterable<string>,
  message: string,
): AnalyticsResult {
  const failed = new Set(ids);
  if (!result.series) return result;
  return {
    ...result,
    series: result.series.map((s) =>
      failed.has(s.id)
        ? {
            ...s,
            points: [],
            error: { code: "RELOAD_FAILED", message },
          }
        : s,
    ),
  };
}
