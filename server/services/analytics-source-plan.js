/**
 * Decides which source API calls one Analytics run needs.
 *
 * - Range not sent to the source (default): a single call. Every measure's
 *   own range is cut from that one response, so per-measure ranges cost no
 *   extra calls.
 * - Range sent as {{startTime}}/{{endTime}}: measures are grouped by their
 *   effective range. Measures with the same range share one call, the shared
 *   range comes first, and groups beyond maxCalls are reported as overflow so
 *   only those measures fail.
 *
 * Pure function: no I/O, so it is unit-testable and reusable.
 */
const { sendsRangeToSource } = require("./analytics-definition");

const rangeKey = (range) =>
  range && range.from != null ? `${range.from}|${range.to}` : "all";

/**
 * @param {object} definition normalized definition
 * @param {{range: object|null, measures: object}} runtime resolved controls
 * @param {number} maxCalls ANALYTICS_MAX_SOURCE_CALLS_PER_RUN
 * @returns {{ calls: {key: string, range: object|null, measureIds: string[],
 *             shared: boolean}[], overflow: string[] }}
 */
function planSourceCalls(definition, runtime, maxCalls) {
  const measures =
    definition.mode === "timeseries"
      ? definition.timeSeries?.measures || []
      : [];
  const sharedKey = rangeKey(runtime.range);
  if (!measures.length || !sendsRangeToSource(definition))
    return {
      calls: [
        {
          key: sharedKey,
          range: runtime.range,
          measureIds: measures.map((m) => m.id),
          shared: true,
        },
      ],
      overflow: [],
    };

  /** @type {Map<string, {key: string, range: object|null, measureIds: string[], shared: boolean}>} */
  const groups = new Map();
  for (const measure of measures) {
    const range = runtime.measures?.[measure.id]?.range ?? runtime.range;
    const key = rangeKey(range);
    if (!groups.has(key))
      groups.set(key, {
        key,
        range,
        measureIds: [],
        shared: key === sharedKey,
      });
    groups.get(key).measureIds.push(measure.id);
  }
  // Shared range first, then in measure order (Map keeps insertion order).
  const ordered = [...groups.values()].sort(
    (a, b) => Number(b.shared) - Number(a.shared),
  );
  const limit = Math.max(1, Math.trunc(maxCalls) || 1);
  return {
    calls: ordered.slice(0, limit),
    overflow: ordered.slice(limit).flatMap((g) => g.measureIds),
  };
}

module.exports = { planSourceCalls, rangeKey };
