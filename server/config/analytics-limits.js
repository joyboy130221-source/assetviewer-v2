/**
 * Central, environment-driven limits for Analytics execution.
 *
 * Every value has a safe default and a hard bound, so a mis-typed variable can
 * never remove protection. Per-definition settings (for example a time-series
 * "Max points per series") are clamped to these ceilings.
 */
const { clamp } = require("./workflow-limits");

function envInt(name, fallback, min, max) {
  const raw = process.env[name];
  const value = raw == null || raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

/** Hard bounds shared with server/lib/integration-http.js. */
const SOURCE_TIMEOUT_FLOOR_MS = 1000;
const SOURCE_TIMEOUT_CEILING_MS = 120000;

function readAnalyticsLimits() {
  const maxSourceTimeoutMs = envInt(
    "ANALYTICS_MAX_SOURCE_TIMEOUT_MS",
    60000,
    SOURCE_TIMEOUT_FLOOR_MS,
    SOURCE_TIMEOUT_CEILING_MS,
  );
  return {
    /** Ceiling for a definition's source API timeout. */
    maxSourceTimeoutMs,
    /** Source API timeout when a definition does not set one (never above the ceiling). */
    defaultSourceTimeoutMs: Math.min(
      envInt(
        "ANALYTICS_DEFAULT_SOURCE_TIMEOUT_MS",
        15000,
        SOURCE_TIMEOUT_FLOOR_MS,
        SOURCE_TIMEOUT_CEILING_MS,
      ),
      maxSourceTimeoutMs,
    ),
    /** Lowest timeout a definition may set. */
    minSourceTimeoutMs: SOURCE_TIMEOUT_FLOOR_MS,
    /**
     * Source API calls one view may make. Only matters when the time range is
     * sent to the source and measures have their own ranges: measures with the
     * same range share one call, and ranges beyond this cap fail per measure.
     */
    maxSourceCallsPerRun: envInt(
      "ANALYTICS_MAX_SOURCE_CALLS_PER_RUN",
      3,
      1,
      10,
    ),
    /** Source API calls of one view that run at the same time. */
    sourceConcurrency: envInt("ANALYTICS_SOURCE_CONCURRENCY", 2, 1, 10),
    /** Seconds a successful source response is reused; 0 disables the cache. */
    sourceCacheTtlSeconds: envInt(
      "ANALYTICS_SOURCE_CACHE_TTL_SECONDS",
      0,
      0,
      3600,
    ),
    /** Cached source responses kept in memory per server process. */
    sourceCacheMaxEntries: envInt(
      "ANALYTICS_SOURCE_CACHE_MAX_ENTRIES",
      100,
      1,
      5000,
    ),
    /** Larger source responses (serialized bytes) are never cached. */
    sourceCacheMaxEntryBytes: envInt(
      "ANALYTICS_SOURCE_CACHE_MAX_ENTRY_BYTES",
      2_000_000,
      1024,
      50_000_000,
    ),
    /** Ceiling for points returned per time series after downsampling. */
    maxPointsPerSeries: envInt(
      "ANALYTICS_MAX_POINTS_PER_SERIES",
      5000,
      100,
      50000,
    ),
    /** Default points per series when a definition does not set one. */
    defaultPointsPerSeries: envInt(
      "ANALYTICS_DEFAULT_POINTS_PER_SERIES",
      2000,
      100,
      50000,
    ),
    /** Maximum measures (series) in one time-series definition. */
    maxMeasures: envInt("ANALYTICS_MAX_MEASURES", 24, 1, 100),
    /** Maximum runtime toolbar filters in one definition. */
    maxRuntimeFilters: envInt("ANALYTICS_MAX_RUNTIME_FILTERS", 10, 0, 50),
    /** Distinct values offered in a runtime dropdown filter. */
    maxFilterOptions: envInt("ANALYTICS_MAX_FILTER_OPTIONS", 100, 1, 1000),
    /** Maximum length of one runtime filter / time value. */
    maxRuntimeValueLength: envInt(
      "ANALYTICS_MAX_RUNTIME_VALUE_LENGTH",
      200,
      10,
      2000,
    ),
    /** Largest JSON request body (bytes) a POST data source may define. */
    maxRequestBodyBytes: envInt(
      "ANALYTICS_MAX_REQUEST_BODY_BYTES",
      65536,
      1024,
      1048576,
    ),
    /** Widest custom time range a viewer may request, in days. */
    maxRangeDays: envInt("ANALYTICS_MAX_RANGE_DAYS", 366, 1, 3660),
  };
}

/**
 * Effective source timeout for a definition: its own value, or the server
 * default, always clamped to the current ceiling (the ceiling may have been
 * lowered after the definition was saved).
 */
function sourceTimeoutMs(configured, limits = readAnalyticsLimits()) {
  const value = Number(configured);
  if (!Number.isFinite(value) || value <= 0)
    return limits.defaultSourceTimeoutMs;
  return Math.min(
    Math.max(Math.trunc(value), limits.minSourceTimeoutMs),
    limits.maxSourceTimeoutMs,
  );
}

/** Limits the builder needs to show (no secrets, safe for authenticated authors). */
function publicBuilderLimits(limits = readAnalyticsLimits()) {
  return {
    sourceTimeoutMs: {
      default: limits.defaultSourceTimeoutMs,
      min: limits.minSourceTimeoutMs,
      max: limits.maxSourceTimeoutMs,
    },
    sourceCalls: { maxPerRun: limits.maxSourceCallsPerRun },
  };
}

module.exports = {
  readAnalyticsLimits,
  sourceTimeoutMs,
  publicBuilderLimits,
  clamp,
};
