import type {
  AnalyticsRuntimeInput,
  TimeBucket,
  TimeRangePreset,
  TimeSeriesChartType,
  TimeSeriesLayout,
} from "../model/analytics.types";
import {
  TIME_BUCKETS,
  TIME_RANGE_PRESETS,
  type CompleteAnalyticsDefinition,
} from "../model/analyticsCatalog";
import {
  activeMeasureOverrides,
  isTimeSeriesChartType,
  measureRuntimeInput,
} from "./analyticsMeasureView";

/**
 * A viewer's choices on one measure's own toolbar. Every field is optional:
 * an absent field follows the shared toolbar.
 */
export type MeasureViewState = {
  preset?: TimeRangePreset | "custom";
  /** ISO timestamps, used when preset is "custom". */
  from?: string;
  to?: string;
  bucket?: TimeBucket;
  chartType?: TimeSeriesChartType;
};

/**
 * What a viewer has changed with the toolbar. Server-side parts (range,
 * bucket, filters) are validated again by the API; presentation parts
 * (chart type, layout, hidden measures) only affect rendering.
 */
export type AnalyticsViewState = {
  preset: TimeRangePreset | "custom";
  /** ISO timestamps, used when preset is "custom". */
  from: string;
  to: string;
  /** Empty uses the definition's bucket. */
  bucket: TimeBucket | "";
  filters: Record<string, string>;
  /** Empty uses the definition's chart type. */
  chartType: string;
  layout: TimeSeriesLayout | "";
  hidden: string[];
  /** Per-measure toolbar choices by measure id. */
  measures: Record<string, MeasureViewState>;
};

const FILTER_PREFIX = "_f_";
/** `_m.<measureId>.<control>`; ids match the server's measure id rule. */
const MEASURE_PREFIX = "_m.";
const MEASURE_KEY =
  /^_m\.([A-Za-z0-9_-]{1,64})\.(preset|from|to|bucket|chart)$/;
const KEYS = [
  "_preset",
  "_from",
  "_to",
  "_bucket",
  "_chart",
  "_layout",
  "_hide",
  "_fresh",
  "_only",
];
const isViewerKey = (key: string) =>
  KEYS.includes(key) ||
  key.startsWith(FILTER_PREFIX) ||
  key.startsWith(MEASURE_PREFIX);

const isPreset = (v: string | null | undefined): v is TimeRangePreset =>
  !!v && TIME_RANGE_PRESETS.some((p) => p.value === v);
const isBucket = (v: string | null | undefined): v is TimeBucket =>
  !!v && TIME_BUCKETS.some((b) => b.value === v);

export function defaultViewState(
  d: CompleteAnalyticsDefinition,
): AnalyticsViewState {
  return {
    preset: d.timeRange.defaultPreset,
    from: "",
    to: "",
    bucket: "",
    filters: Object.fromEntries(
      d.toolbar.filters
        .filter((f) => f.defaultValue)
        .map((f) => [f.id, f.defaultValue]),
    ),
    chartType: "",
    layout: "",
    hidden: [],
    measures: {},
  };
}

/** Restores a shared/bookmarked view from the page URL. */
export function readViewState(
  d: CompleteAnalyticsDefinition,
  search: URLSearchParams,
): AnalyticsViewState {
  const state = defaultViewState(d);
  const preset = search.get("_preset");
  const from = search.get("_from") ?? "";
  const to = search.get("_to") ?? "";
  if (from && to) Object.assign(state, { preset: "custom", from, to });
  else if (isPreset(preset)) state.preset = preset;
  const bucket = search.get("_bucket");
  if (isBucket(bucket)) state.bucket = bucket;
  state.chartType = search.get("_chart") ?? "";
  const layout = search.get("_layout");
  if (layout === "separate" || layout === "combined") state.layout = layout;
  state.hidden = (search.get("_hide") ?? "").split(",").filter(Boolean);
  for (const filter of d.toolbar.filters) {
    const value = search.get(`${FILTER_PREFIX}${filter.id}`);
    if (value != null) state.filters[filter.id] = value;
  }
  state.measures = readMeasureStates(d, search);
  return state;
}

function readMeasureStates(
  d: CompleteAnalyticsDefinition,
  search: URLSearchParams,
): Record<string, MeasureViewState> {
  const known = new Set(
    d.timeSeries.measures.filter((m) => m.toolbar.enabled).map((m) => m.id),
  );
  const raw: Record<string, Record<string, string>> = {};
  for (const [key, value] of search) {
    const match = MEASURE_KEY.exec(key);
    if (!match || !known.has(match[1])) continue;
    (raw[match[1]] ??= {})[match[2]] = value;
  }
  const states: Record<string, MeasureViewState> = {};
  for (const [id, v] of Object.entries(raw)) {
    const own: MeasureViewState = {};
    if (v.from && v.to)
      Object.assign(own, { preset: "custom", from: v.from, to: v.to });
    else if (isPreset(v.preset)) own.preset = v.preset;
    if (isBucket(v.bucket)) own.bucket = v.bucket;
    if (isTimeSeriesChartType(v.chart)) own.chartType = v.chart;
    if (Object.keys(own).length) states[id] = own;
  }
  return states;
}

/**
 * Writes the view into a copy of the URL parameters. Only viewer-owned keys
 * are touched, so caller parameters (asset code, darkTheme, evk) survive.
 */
export function writeViewState(
  state: AnalyticsViewState,
  defaults: AnalyticsViewState,
  search: URLSearchParams,
): URLSearchParams {
  const next = callerParameters(search);
  if (state.preset === "custom" && state.from && state.to) {
    next.set("_from", state.from);
    next.set("_to", state.to);
  } else if (state.preset !== defaults.preset)
    next.set("_preset", state.preset);
  if (state.bucket) next.set("_bucket", state.bucket);
  if (state.chartType) next.set("_chart", state.chartType);
  if (state.layout) next.set("_layout", state.layout);
  if (state.hidden.length) next.set("_hide", state.hidden.join(","));
  for (const [id, value] of Object.entries(state.filters))
    if (value) next.set(`${FILTER_PREFIX}${id}`, value);
  for (const [id, own] of Object.entries(state.measures)) {
    const key = (control: string) => `${MEASURE_PREFIX}${id}.${control}`;
    if (own.preset === "custom" && own.from && own.to) {
      next.set(key("from"), own.from);
      next.set(key("to"), own.to);
    } else if (own.preset && own.preset !== "custom")
      next.set(key("preset"), own.preset);
    if (own.bucket) next.set(key("bucket"), own.bucket);
    if (own.chartType) next.set(key("chart"), own.chartType);
  }
  return next;
}

/**
 * The server-validated part of the view. With the definition, per-measure
 * overrides that are in effect are included (see activeMeasureOverrides).
 */
export function toRuntimeInput(
  state: AnalyticsViewState,
  d?: CompleteAnalyticsDefinition,
): AnalyticsRuntimeInput {
  const input: AnalyticsRuntimeInput = {
    filters: Object.fromEntries(
      Object.entries(state.filters).filter(([, v]) => v !== ""),
    ),
  };
  if (state.preset === "custom") {
    if (state.from && state.to)
      Object.assign(input, { from: state.from, to: state.to });
  } else input.preset = state.preset;
  if (state.bucket) input.bucket = state.bucket;
  if (d) {
    const measures = measureRuntimeInput(activeMeasureOverrides(d, state));
    if (measures) input.measures = measures;
  }
  return input;
}

/** Query-string form of the runtime input for the published-analytics API. */
export function runtimeQuery(input: AnalyticsRuntimeInput): URLSearchParams {
  const q = new URLSearchParams();
  if (input.preset) q.set("_preset", input.preset);
  if (input.from) q.set("_from", input.from);
  if (input.to) q.set("_to", input.to);
  if (input.bucket) q.set("_bucket", input.bucket);
  for (const [id, value] of Object.entries(input.filters ?? {}))
    q.set(`${FILTER_PREFIX}${id}`, value);
  for (const [id, own] of Object.entries(input.measures ?? {}))
    for (const control of ["preset", "from", "to", "bucket"] as const) {
      const value = own[control];
      if (value) q.set(`${MEASURE_PREFIX}${id}.${control}`, value);
    }
  if (input.fresh) q.set("_fresh", "1");
  if (input.only?.length) q.set("_only", input.only.join(","));
  return q;
}

/** Changes only when the data must be fetched again. */
export const runtimeKey = (
  state: AnalyticsViewState,
  d?: CompleteAnalyticsDefinition,
) => JSON.stringify(toRuntimeInput(state, d));

/** Caller parameters with every viewer-owned key removed. */
export function callerParameters(search: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(search);
  for (const key of [...next.keys()]) if (isViewerKey(key)) next.delete(key);
  return next;
}
