/**
 * Viewer runtime controls (time range, bucket interval, toolbar filters).
 *
 * The viewer only ever sends *values*. What may be changed, and how each value
 * is applied, comes from the saved definition: a control that the author did
 * not expose is ignored, and every value is validated here before it reaches
 * the source request or the BIB engine.
 */
const { readAnalyticsLimits } = require("../config/analytics-limits");
const { BUCKETS, PRESETS } = require("./analytics-definition");

/** Query-string keys owned by the viewer; never passed to templates. */
const RESERVED_KEY =
  /^_(preset|from|to|bucket|chart|layout|hide|fresh|only|f_[A-Za-z0-9_-]{1,64}|m\.[A-Za-z0-9_-]{1,64}\.(preset|from|to|bucket|chart))$/;
const FILTER_KEY_PREFIX = "_f_";
/** Per-measure viewer keys: `_m.<measureId>.<control>`. */
const MEASURE_KEY =
  /^_m\.([A-Za-z0-9_-]{1,64})\.(preset|from|to|bucket|chart)$/;
/** Server-side per-measure controls (chart is presentation-only). */
const MEASURE_SERVER_CONTROLS = ["preset", "from", "to", "bucket"];

const badRequest = (message) =>
  Object.assign(new Error(message), { status: 400 });

/** Parses ISO strings and epoch numbers (seconds or milliseconds) to epoch ms. */
function parseTime(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (
    typeof value === "number" ||
    /^-?\d+(\.\d+)?$/.test(String(value).trim())
  ) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    // 10-digit epochs are seconds; 13-digit are milliseconds.
    return Math.abs(n) < 1e11 ? n * 1000 : n;
  }
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? null : ms;
}

function formatParam(ms, format) {
  if (format === "epochMs") return String(ms);
  if (format === "epochS") return String(Math.floor(ms / 1000));
  return new Date(ms).toISOString();
}

/** Splits a published-analytics query string into template context and viewer input. */
function splitPublicQuery(query) {
  const context = {};
  const input = { filters: {} };
  for (const [key, raw] of Object.entries(query || {})) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!RESERVED_KEY.test(key)) {
      context[key] = value;
      continue;
    }
    const measureKey = MEASURE_KEY.exec(key);
    if (measureKey) {
      const [, measureId, control] = measureKey;
      if (!MEASURE_SERVER_CONTROLS.includes(control)) continue;
      input.measures ??= {};
      input.measures[measureId] ??= {};
      input.measures[measureId][control] = value;
    } else if (key.startsWith(FILTER_KEY_PREFIX))
      input.filters[key.slice(FILTER_KEY_PREFIX.length)] = value;
    else if (["_preset", "_from", "_to", "_bucket"].includes(key))
      input[key.slice(1)] = value;
    else if (key === "_fresh") input.fresh = value === "1";
    else if (key === "_only")
      input.only = String(value ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    // _chart / _layout / _hide (and _m.<id>.chart) are presentation-only.
  }
  return { context, input };
}

/**
 * @param {object} config definition.timeRange
 * @param {string} subject prefix for error messages ("" for the shared range)
 */
function resolveRange(config, input, limits, now, subject = "") {
  if (!config?.enabled) return null;
  const prefix = subject ? `${subject}: ` : "";
  const from = parseTime(input.from);
  const to = parseTime(input.to);
  if (config.allowCustom && (from != null || to != null)) {
    if (from == null || to == null)
      throw badRequest(
        `${prefix}A custom time range needs both a start and an end.`,
      );
    if (from >= to)
      throw badRequest(`${prefix}The time range start must be before its end.`);
    if (to - from > limits.maxRangeDays * 86_400_000)
      throw badRequest(
        `${prefix}The time range may not exceed ${limits.maxRangeDays} days.`,
      );
    return { from, to, preset: "custom" };
  }
  const allowed = new Set([...(config.presets || []), config.defaultPreset]);
  const preset =
    input.preset && allowed.has(input.preset)
      ? input.preset
      : config.defaultPreset;
  const span = PRESETS[preset];
  if (!span) return { from: null, to: null, preset };
  return { from: now - span, to: now, preset };
}

/** A known bucket from the viewer when allowed, otherwise the fallback. */
function pickBucket(allowed, requested, fallback) {
  return allowed && requested && Object.hasOwn(BUCKETS, requested)
    ? requested
    : fallback;
}

function resolveBucket(definition, input) {
  const toolbar = definition.toolbar;
  return pickBucket(
    !!(toolbar?.enabled && toolbar.allowBucket),
    input.bucket,
    definition.timeSeries?.bucket || "raw",
  );
}

const sameRange = (a, b) =>
  (a?.from ?? null) === (b?.from ?? null) &&
  (a?.to ?? null) === (b?.to ?? null);

/**
 * Effective range and bucket for every time-series measure. A measure follows
 * the shared controls unless the author gave it its own toolbar with that
 * control enabled and the viewer sent a value for it. Values for unknown
 * measures or controls the author did not enable are ignored.
 */
function resolveMeasures(definition, input, shared, limits, now) {
  const result = {};
  if (definition.mode !== "timeseries") return result;
  const requested =
    input.measures && typeof input.measures === "object" ? input.measures : {};
  for (const measure of definition.timeSeries?.measures || []) {
    const toolbar = measure.toolbar || {};
    const own =
      toolbar.enabled && Object.hasOwn(requested, measure.id)
        ? requested[measure.id] || {}
        : {};
    const label = measure.label || measure.field;
    const rangeAllowed = !!(toolbar.enabled && toolbar.allowTimeRange);
    const hasOwnRange =
      rangeAllowed &&
      (own.preset != null || own.from != null || own.to != null);
    const range = hasOwnRange
      ? resolveRange(definition.timeRange, own, limits, now, label)
      : shared.range;
    const bucket = pickBucket(
      !!(toolbar.enabled && toolbar.allowBucket),
      own.bucket,
      shared.bucket,
    );
    result[measure.id] = {
      range,
      bucket,
      ownRange: hasOwnRange && !sameRange(range, shared.range),
      ownBucket: bucket !== shared.bucket,
    };
  }
  return result;
}

/** {{parameter}} values for one source call (time range plus source filters). */
function sourceContextFor(definition, range, filterValues) {
  const context = {};
  const tr = definition.timeRange || {};
  if (range && range.from != null) {
    if (tr.fromParam)
      context[tr.fromParam] = formatParam(range.from, tr.paramFormat);
    if (tr.toParam) context[tr.toParam] = formatParam(range.to, tr.paramFormat);
  }
  for (const { filter, value } of filterValues)
    if (filter.applyIn === "source" && filter.param)
      context[filter.param] = value;
  return context;
}

function resolveFilterValues(definition, input, limits) {
  const toolbar = definition.toolbar;
  if (!toolbar?.enabled) return [];
  const values = input.filters || {};
  const resolved = [];
  for (const filter of toolbar.filters || []) {
    const raw = Object.hasOwn(values, filter.id)
      ? values[filter.id]
      : filter.defaultValue;
    const value = String(raw ?? "").trim();
    if (!value) continue;
    if (value.length > limits.maxRuntimeValueLength)
      throw badRequest(
        `Filter '${filter.label || filter.field}' value is too long.`,
      );
    if (filter.control === "number" && !Number.isFinite(Number(value)))
      throw badRequest(
        `Filter '${filter.label || filter.field}' must be a number.`,
      );
    if (
      filter.control === "select" &&
      !filter.optionsFromData &&
      filter.options.length &&
      !filter.options.includes(value)
    )
      throw badRequest(
        `Filter '${filter.label || filter.field}' has an unknown value.`,
      );
    resolved.push({ filter, value });
  }
  return resolved;
}

/**
 * Validates viewer input against the definition.
 * @returns {{ range: {from:number|null,to:number|null,preset:string}|null,
 *             bucket: string,
 *             filterValues: {filter: object, value: string}[],
 *             sourceContext: Record<string,string>,
 *             measures: Record<string, {range: object|null, bucket: string,
 *                                       ownRange: boolean, ownBucket: boolean}>,
 *             fresh: boolean }}
 */
function resolveRuntime(definition, input = {}, now = Date.now()) {
  const limits = readAnalyticsLimits();
  const safe = input || {};
  const range = resolveRange(definition.timeRange, safe, limits, now);
  const bucket = resolveBucket(definition, safe);
  const filterValues = resolveFilterValues(definition, safe, limits);
  const measures = resolveMeasures(
    definition,
    safe,
    { range, bucket },
    limits,
    now,
  );
  return {
    range,
    bucket,
    filterValues,
    sourceContext: sourceContextFor(definition, range, filterValues),
    measures,
    fresh: safe.fresh === true,
  };
}

module.exports = {
  resolveRuntime,
  splitPublicQuery,
  sourceContextFor,
  sameRange,
  parseTime,
  RESERVED_KEY,
};
