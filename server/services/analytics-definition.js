/**
 * Analytics definition contract: allowed values, defaults and normalization.
 *
 * One place for every route that reads or writes a definition (admin CRUD,
 * admin execute, published analytics), so stored JSON written by any earlier
 * version resolves to the same complete, validated shape.
 *
 * Backward compatibility: every property added after V1 is optional. A
 * definition without `mode` is an aggregate definition and behaves exactly as
 * before; time series, time range and the viewer toolbar are off by default.
 */
const {
  readAnalyticsLimits,
  sourceTimeoutMs,
} = require("../config/analytics-limits");
const { validatedQueryParameters } = require("../lib/query-params");

const MODES = ["aggregate", "timeseries"];
/** Read-style requests only: POST is for query APIs that take a JSON payload. */
const SOURCE_METHODS = ["GET", "POST"];
const AGGREGATE_TYPES = ["kpi", "bar", "line", "pie", "table"];
const TIMESERIES_TYPES = ["line", "step", "area", "bar", "scatter", "table"];
const LAYOUTS = ["separate", "combined"];
const AGGREGATIONS = ["count", "sum", "avg", "min", "max"];
const BUCKET_AGGREGATIONS = ["avg", "min", "max", "sum", "last", "count"];
const FILTER_OPERATORS = [
  "equals",
  "notEquals",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
];
const FILTER_CONTROLS = ["select", "text", "number"];
const PARAM_FORMATS = ["iso", "epochMs", "epochS"];
const THEMES = ["auto", "light", "dark"];

/** Bucket intervals in milliseconds; "raw" keeps every reading. */
const BUCKETS = Object.freeze({
  raw: 0,
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "6h": 21_600_000,
  "1d": 86_400_000,
});

/** Relative time-range presets in milliseconds; "all" applies no range. */
const PRESETS = Object.freeze({
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "12h": 43_200_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
  all: 0,
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const pick = (value, allowed, fallback) =>
  allowed.includes(value) ? value : fallback;
const text = (value, max = 500) => String(value ?? "").slice(0, max);
const bool = (value, fallback) =>
  typeof value === "boolean" ? value : fallback;
const id = (value, index, prefix) =>
  /^[A-Za-z0-9_-]{1,64}$/.test(String(value ?? ""))
    ? String(value)
    : `${prefix}${index + 1}`;
const param = (value) =>
  PARAM_NAME.test(String(value ?? "")) ? String(value) : "";

const DEFAULT_APPEARANCE = Object.freeze({
  colorMode: "palette",
  palette: "default",
  singleColor: "#2563eb",
  categoryColors: {},
});

function defaults() {
  const limits = readAnalyticsLimits();
  return {
    mode: "aggregate",
    dataSource: {
      type: "rest",
      action: { method: "GET", url: "", headers: {}, params: [] },
      arrayPath: "",
    },
    queryParams: [],
    filterMode: "bib",
    filters: [],
    dimension: "",
    measure: "",
    aggregation: "count",
    timeSeries: {
      timeField: "",
      measures: [],
      layout: "separate",
      chartType: "line",
      bucket: "raw",
      bucketAggregation: "avg",
      maxPoints: limits.defaultPointsPerSeries,
      showPoints: true,
      smooth: false,
      zoom: true,
    },
    timeRange: {
      enabled: false,
      field: "",
      defaultPreset: "24h",
      presets: ["1h", "4h", "24h", "7d"],
      allowCustom: true,
      fromParam: "",
      toParam: "",
      paramFormat: "iso",
    },
    toolbar: {
      enabled: false,
      chartTypes: [],
      allowLayout: true,
      allowMeasureToggle: true,
      allowBucket: true,
      filters: [],
    },
    visualization: {
      type: "bar",
      title: "",
      showLegend: true,
      showLabels: true,
      theme: "auto",
      appearance: { ...DEFAULT_APPEARANCE },
    },
  };
}

/**
 * A measure's own viewer toolbar. Only takes effect in Separate layout; the
 * controls a viewer may change are exactly the ones enabled here. Missing
 * (every definition saved before this setting) means "follow the shared
 * toolbar".
 */
function normalizeMeasureToolbar(value) {
  const v = value || {};
  return {
    enabled: bool(v.enabled, false),
    chartTypes: (Array.isArray(v.chartTypes) ? v.chartTypes : []).filter(
      (t, i, all) => TIMESERIES_TYPES.includes(t) && all.indexOf(t) === i,
    ),
    allowBucket: bool(v.allowBucket, false),
    allowTimeRange: bool(v.allowTimeRange, false),
  };
}

function normalizeMeasures(value, limits) {
  return (Array.isArray(value) ? value : [])
    .slice(0, limits.maxMeasures)
    .map((m, index) => ({
      id: id(m?.id, index, "m"),
      field: text(m?.field, 300).trim(),
      label: text(m?.label, 120),
      unit: text(m?.unit, 30),
      color: HEX_COLOR.test(String(m?.color ?? "")) ? m.color : "",
      chartType: pick(m?.chartType, TIMESERIES_TYPES, ""),
      decimals:
        m?.decimals === "" ||
        m?.decimals == null ||
        !Number.isFinite(Number(m.decimals))
          ? null
          : Math.min(Math.max(Math.trunc(Number(m.decimals)), 0), 8),
      toolbar: normalizeMeasureToolbar(m?.toolbar),
    }))
    .filter((m) => m.field);
}

/**
 * POST data sources carry a JSON body (object or array) whose string values
 * may contain {{parameter}} templates. GET sources never send a body.
 */
function normalizeRequestBody(method, body, limits) {
  if (method !== "POST") return undefined;
  let value = body;
  if (typeof value === "string") {
    try {
      value = value.trim() ? JSON.parse(value) : {};
    } catch {
      throw Object.assign(new Error("Request body must be valid JSON."), {
        status: 400,
      });
    }
  }
  if (value == null) return {};
  if (typeof value !== "object")
    throw Object.assign(
      new Error("Request body must be a JSON object or array."),
      {
        status: 400,
      },
    );
  if (Buffer.byteLength(JSON.stringify(value)) > limits.maxRequestBodyBytes)
    throw Object.assign(
      new Error(
        `Request body may not exceed ${limits.maxRequestBodyBytes} bytes.`,
      ),
      { status: 400 },
    );
  return value;
}

/**
 * Optional per-definition source timeout (ms). Blank means "use the server
 * default", so definitions saved before this setting keep following
 * ANALYTICS_DEFAULT_SOURCE_TIMEOUT_MS.
 */
function normalizeSourceTimeout(value, limits) {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return sourceTimeoutMs(number, limits);
}

function normalizeDataSource(dataSource, base, limits) {
  if (!dataSource) return base;
  const action = dataSource.action || {};
  const method = pick(
    String(action.method || "GET").toUpperCase(),
    SOURCE_METHODS,
    "GET",
  );
  const { body: _ignored, timeoutMs: _timeout, ...rest } = action;
  const body = normalizeRequestBody(method, action.body, limits);
  const timeoutMs = normalizeSourceTimeout(action.timeoutMs, limits);
  return {
    ...base,
    ...dataSource,
    type: "rest",
    action: {
      ...base.action,
      ...rest,
      method,
      params: validatedQueryParameters(action.params),
      ...(body !== undefined ? { body, bodyFormat: "json" } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    },
    arrayPath: text(dataSource.arrayPath, 300).trim(),
  };
}

function normalizeTimeSeries(value, base, limits) {
  const v = value || {};
  const maxPoints = Number(v.maxPoints);
  return {
    timeField: text(v.timeField, 300).trim(),
    measures: normalizeMeasures(v.measures, limits),
    layout: pick(v.layout, LAYOUTS, base.layout),
    chartType: pick(v.chartType, TIMESERIES_TYPES, base.chartType),
    bucket: Object.hasOwn(BUCKETS, v.bucket) ? v.bucket : base.bucket,
    bucketAggregation: pick(
      v.bucketAggregation,
      BUCKET_AGGREGATIONS,
      base.bucketAggregation,
    ),
    maxPoints: Number.isFinite(maxPoints)
      ? Math.min(
          Math.max(Math.trunc(maxPoints), 100),
          limits.maxPointsPerSeries,
        )
      : base.maxPoints,
    showPoints: bool(v.showPoints, base.showPoints),
    smooth: bool(v.smooth, base.smooth),
    zoom: bool(v.zoom, base.zoom),
  };
}

function normalizeTimeRange(value, base) {
  const v = value || {};
  const presets = (Array.isArray(v.presets) ? v.presets : base.presets).filter(
    (p, i, all) => Object.hasOwn(PRESETS, p) && all.indexOf(p) === i,
  );
  return {
    enabled: bool(v.enabled, base.enabled),
    field: text(v.field, 300).trim(),
    defaultPreset: Object.hasOwn(PRESETS, v.defaultPreset)
      ? v.defaultPreset
      : base.defaultPreset,
    presets,
    allowCustom: bool(v.allowCustom, base.allowCustom),
    fromParam: param(v.fromParam),
    toParam: param(v.toParam),
    paramFormat: pick(v.paramFormat, PARAM_FORMATS, base.paramFormat),
  };
}

function normalizeRuntimeFilters(value, limits) {
  return (
    (Array.isArray(value) ? value : [])
      .slice(0, limits.maxRuntimeFilters)
      .map((f, index) => {
        const applyIn = f?.applyIn === "source" ? "source" : "bib";
        return {
          id: id(f?.id, index, "f"),
          field: text(f?.field, 300).trim(),
          label: text(f?.label, 120),
          control: pick(f?.control, FILTER_CONTROLS, "select"),
          operator: pick(f?.operator, FILTER_OPERATORS, "equals"),
          applyIn,
          param: param(f?.param),
          options: (Array.isArray(f?.options) ? f.options : [])
            .map((o) => text(o, limits.maxRuntimeValueLength))
            .filter(Boolean)
            .slice(0, limits.maxFilterOptions),
          optionsFromData: bool(f?.optionsFromData, true),
          defaultValue: text(f?.defaultValue, limits.maxRuntimeValueLength),
        };
      })
      // A BIB filter needs a field; a Source filter needs a parameter name.
      .filter((f) => (f.applyIn === "bib" ? f.field : f.param))
  );
}

function normalizeToolbar(value, mode, base, limits) {
  const v = value || {};
  const allowedTypes =
    mode === "timeseries" ? TIMESERIES_TYPES : AGGREGATE_TYPES;
  return {
    enabled: bool(v.enabled, base.enabled),
    chartTypes: (Array.isArray(v.chartTypes) ? v.chartTypes : []).filter(
      (t, i, all) => allowedTypes.includes(t) && all.indexOf(t) === i,
    ),
    allowLayout: bool(v.allowLayout, base.allowLayout),
    allowMeasureToggle: bool(v.allowMeasureToggle, base.allowMeasureToggle),
    allowBucket: bool(v.allowBucket, base.allowBucket),
    filters: normalizeRuntimeFilters(v.filters, limits),
  };
}

/**
 * Returns the complete, validated definition body (everything except the
 * row metadata such as id, organization and status).
 */
function normalizeDefinitionBody(input) {
  const b = input || {};
  const base = defaults();
  const limits = readAnalyticsLimits();
  const mode = pick(b.mode, MODES, base.mode);
  const vis = b.visualization || {};
  return {
    mode,
    dataSource: normalizeDataSource(b.dataSource, base.dataSource, limits),
    queryParams: (Array.isArray(b.queryParams) ? b.queryParams : [])
      .map((p) => String(p).trim())
      .filter(Boolean)
      .slice(0, 50),
    filterMode: b.filterMode === "source" ? "source" : "bib",
    filters: Array.isArray(b.filters) ? b.filters : [],
    dimension: text(b.dimension, 300),
    measure: text(b.measure, 300),
    aggregation: pick(b.aggregation, AGGREGATIONS, base.aggregation),
    timeSeries: normalizeTimeSeries(b.timeSeries, base.timeSeries, limits),
    timeRange: normalizeTimeRange(b.timeRange, base.timeRange),
    toolbar: normalizeToolbar(b.toolbar, mode, base.toolbar, limits),
    visualization: {
      ...base.visualization,
      ...vis,
      type: pick(vis.type, AGGREGATE_TYPES, base.visualization.type),
      theme: pick(vis.theme, THEMES, base.visualization.theme),
      appearance: { ...DEFAULT_APPEARANCE, ...(vis.appearance || {}) },
    },
  };
}

/** Maps a stored analytics_definitions row to the API shape. */
function mapDefinitionRow(row, { includeOrganizationName = true } = {}) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    ...(includeOrganizationName
      ? { organizationName: row.organization_name }
      : {}),
    name: row.name,
    description: row.description || "",
    status: row.status,
    ...normalizeDefinitionBody(row.definition || {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

/** True when the time range is passed to the source API as {{parameters}}. */
const sendsRangeToSource = (definition) =>
  !!(definition.timeRange?.fromParam || definition.timeRange?.toParam);

/**
 * A REST data source normalized exactly like an analytic's (method, query
 * parameters, JSON body, timeout). Reused by Analytics Pages for their item API.
 */
function normalizeRestSource(dataSource) {
  return normalizeDataSource(
    dataSource || {},
    defaults().dataSource,
    readAnalyticsLimits(),
  );
}

/**
 * What an anonymous viewer needs to render a published definition. The data
 * source (URL, headers, query parameters) and static filter values stay
 * server-side: they can reveal internal endpoints or credentials.
 */
function publicView(d) {
  const { dataSource, filters, filterMode, ...view } = d;
  return view;
}

module.exports = {
  BUCKETS,
  sendsRangeToSource,
  normalizeRestSource,
  publicView,
  PRESETS,
  FILTER_OPERATORS,
  normalizeDefinitionBody,
  mapDefinitionRow,
};
