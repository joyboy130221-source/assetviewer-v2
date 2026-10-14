/**
 * Time-series engine for Analytics.
 *
 * Turns source records into one numeric series per configured measure:
 * time parsing → time-range filter → sort → optional bucketing → downsampling.
 * Provider-neutral: the time field and measures are paths configured in the
 * definition, so no source format is hardcoded here.
 */
const { getPath } = require("../lib/integration-http");
const { readAnalyticsLimits } = require("../config/analytics-limits");
const { BUCKETS } = require("./analytics-definition");
const { parseTime } = require("./analytics-runtime");

const badRequest = (message) =>
  Object.assign(new Error(message), { status: 400 });

/** Numbers, numeric strings and booleans become numbers; anything else is skipped. */
function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function reduceBucket(values, aggregation) {
  if (aggregation === "last") return values[values.length - 1];
  if (aggregation === "count") return values.length;
  if (aggregation === "min") return Math.min(...values);
  if (aggregation === "max") return Math.max(...values);
  const sum = values.reduce((a, b) => a + b, 0);
  return aggregation === "sum" ? sum : sum / values.length;
}

function bucketize(points, size, aggregation) {
  if (!size) return points;
  const groups = new Map();
  for (const [t, v] of points) {
    const key = Math.floor(t / size) * size;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, values]) => [t, reduceBucket(values, aggregation)]);
}

/**
 * Largest-Triangle-Three-Buckets downsampling: keeps the visual shape
 * (peaks and troughs) of a line while bounding the number of points.
 */
function downsample(points, threshold) {
  if (points.length <= threshold || threshold < 3) return points;
  const sampled = [points[0]];
  const every = (points.length - 2) / (threshold - 2);
  let a = 0;
  for (let i = 0; i < threshold - 2; i += 1) {
    const avgStart = Math.floor((i + 1) * every) + 1;
    const avgEnd = Math.min(Math.floor((i + 2) * every) + 1, points.length);
    let avgX = 0,
      avgY = 0;
    for (let j = avgStart; j < avgEnd; j += 1) {
      avgX += points[j][0];
      avgY += points[j][1];
    }
    const len = Math.max(avgEnd - avgStart, 1);
    avgX /= len;
    avgY /= len;
    const rangeStart = Math.floor(i * every) + 1;
    const rangeEnd = Math.floor((i + 1) * every) + 1;
    const [ax, ay] = points[a];
    let maxArea = -1,
      next = rangeStart;
    for (let j = rangeStart; j < rangeEnd; j += 1) {
      const area = Math.abs(
        (ax - avgX) * (points[j][1] - ay) - (ax - points[j][0]) * (avgY - ay),
      );
      if (area > maxArea) {
        maxArea = area;
        next = j;
      }
    }
    sampled.push(points[next]);
    a = next;
  }
  sampled.push(points[points.length - 1]);
  return sampled;
}

function stats(points) {
  if (!points.length)
    return { count: 0, min: null, max: null, avg: null, last: null };
  let min = Infinity,
    max = -Infinity,
    sum = 0;
  for (const [, v] of points) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return {
    count: points.length,
    min,
    max,
    avg: sum / points.length,
    last: points[points.length - 1][1],
  };
}

const EMPTY_STATS = Object.freeze({
  count: 0,
  min: null,
  max: null,
  avg: null,
  last: null,
});

/** First index whose time is >= t (timed is sorted ascending). */
function lowerBound(timed, t) {
  let lo = 0,
    hi = timed.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (timed[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
/** First index whose time is > t. */
function upperBound(timed, t) {
  let lo = 0,
    hi = timed.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (timed[mid].t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Records inside the range as [start, end) indexes, in O(log n). */
function sliceRange(timed, range) {
  if (!range || range.from == null) return [0, timed.length];
  return [lowerBound(timed, range.from), upperBound(timed, range.to)];
}

function configuredMaxPoints(ts) {
  const limits = readAnalyticsLimits();
  return Math.min(
    Math.max(Number(ts.maxPoints) || limits.defaultPointsPerSeries, 100),
    limits.maxPointsPerSeries,
  );
}

function validateTimeSeries(ts) {
  if (!ts.timeField) throw badRequest("Time series needs a Time field.");
  if (!ts.measures?.length)
    throw badRequest("Time series needs at least one measure.");
}

/**
 * Parses each record's time once and sorts the result. Shared by every
 * measure that reads from the same source response.
 * @returns {{ timed: {t: number, row: object}[], unparsedTime: number }}
 */
function prepareTimeline(rows, timeField) {
  const timed = [];
  let unparsedTime = 0;
  for (const row of rows) {
    const t = parseTime(getPath(row, timeField));
    if (t == null) unparsedTime += 1;
    else timed.push({ t, row });
  }
  timed.sort((a, b) => a.t - b.t);
  return { timed, unparsedTime };
}

/** Presentation fields of a series, shared by data and error results. */
function seriesMeta(measure, view) {
  return {
    id: measure.id,
    field: measure.field,
    label: measure.label || measure.field.split(".").pop(),
    unit: measure.unit || "",
    color: measure.color || "",
    chartType: measure.chartType || "",
    decimals: measure.decimals,
    timeRange: view.range,
    bucket: view.bucket,
  };
}

/**
 * One measure's series from a prepared timeline.
 * @param {{range: object|null, bucket: string}} view effective controls
 */
function measureSeries(measure, timeline, view, ts, maxPoints) {
  const [start, end] = sliceRange(timeline.timed, view.range);
  const raw = [];
  for (let i = start; i < end; i += 1) {
    const { t, row } = timeline.timed[i];
    const v = toNumber(getPath(row, measure.field));
    if (v != null) raw.push([t, v]);
  }
  const bucketed = bucketize(
    raw,
    BUCKETS[view.bucket] || 0,
    ts.bucketAggregation,
  );
  const points = downsample(bucketed, maxPoints);
  return {
    ...seriesMeta(measure, view),
    points,
    stats: stats(bucketed),
    sourcePoints: raw.length,
    downsampled: points.length < bucketed.length,
  };
}

/** A measure that could not be loaded; the other measures still render. */
function failedSeries(measure, view, error) {
  return {
    ...seriesMeta(measure, view),
    points: [],
    stats: { ...EMPTY_STATS },
    sourcePoints: 0,
    downsampled: false,
    error,
  };
}

/** Records and extent inside the shared range (the viewer's summary line). */
function sharedSummary(timeline, range) {
  const [start, end] = sliceRange(timeline.timed, range);
  return {
    timedCount: end - start,
    extent:
      end > start
        ? { from: timeline.timed[start].t, to: timeline.timed[end - 1].t }
        : null,
  };
}

/**
 * Builds every measure from one set of records. Each measure uses its own
 * effective range and bucket from runtime.measures when present, otherwise
 * the shared runtime.range / runtime.bucket (definitions without per-measure
 * toolbars behave exactly as before).
 * @param {object[]} rows source records (already filtered by BIB filters)
 * @param {object} definition normalized analytics definition
 * @param {{range: object|null, bucket: string, measures?: object}} runtime
 */
function buildTimeSeries(rows, definition, runtime) {
  const ts = definition.timeSeries || {};
  validateTimeSeries(ts);
  const maxPoints = configuredMaxPoints(ts);
  const timeline = prepareTimeline(rows, ts.timeField);
  const shared = { range: runtime.range, bucket: runtime.bucket };
  const series = ts.measures.map((measure) =>
    measureSeries(
      measure,
      timeline,
      runtime.measures?.[measure.id] || shared,
      ts,
      maxPoints,
    ),
  );
  return {
    series,
    ...sharedSummary(timeline, runtime.range),
    unparsedTime: timeline.unparsedTime,
    bucket: runtime.bucket,
  };
}

module.exports = {
  buildTimeSeries,
  prepareTimeline,
  measureSeries,
  failedSeries,
  sharedSummary,
  validateTimeSeries,
  configuredMaxPoints,
  sliceRange,
  downsample,
  bucketize,
  toNumber,
};
