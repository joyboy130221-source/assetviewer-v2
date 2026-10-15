import type { QueryParameters } from "../../../shared/http/queryParams";
export type AnalyticsStatus = "draft" | "published";
/** "aggregate" (V1 behaviour, default) or "timeseries". */
export type AnalyticsMode = "aggregate" | "timeseries";
export type VisualizationType = "kpi" | "bar" | "line" | "pie" | "table";
export type TimeSeriesChartType =
  "line" | "step" | "area" | "bar" | "scatter" | "table";
export type TimeSeriesLayout = "separate" | "combined";
export type AggregationType = "count" | "sum" | "avg" | "min" | "max";
export type BucketAggregation =
  "avg" | "min" | "max" | "sum" | "last" | "count";
export type TimeBucket =
  "raw" | "1m" | "5m" | "15m" | "30m" | "1h" | "6h" | "1d";
export type TimeRangePreset =
  "15m" | "1h" | "4h" | "12h" | "24h" | "7d" | "30d" | "all";
export type TimeParamFormat = "iso" | "epochMs" | "epochS";
export type AnalyticsTheme = "auto" | "light" | "dark";
export type FilterMode = "source" | "bib";
export type FilterOperator =
  "equals" | "notEquals" | "contains" | "gt" | "gte" | "lt" | "lte";
export type AnalyticsColorMode = "palette" | "single" | "category" | "custom";
export type AnalyticsPalette =
  "default" | "cool" | "warm" | "vivid" | "professional";
export type AnalyticsAppearance = {
  colorMode: AnalyticsColorMode;
  palette: AnalyticsPalette;
  singleColor: string;
  categoryColors: Record<string, string>;
};

export type AnalyticsSourceMethod = "GET" | "POST";
/** Any JSON value; string values may contain {{parameter}} templates. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type AnalyticsApiAction = {
  /** POST is for query APIs that take a JSON payload (e.g. BECS ExecuteProject). */
  method: AnalyticsSourceMethod;
  url: string;
  headers: Record<string, string>;
  params: QueryParameters;
  /** JSON request body, POST only. */
  body?: JsonValue;
  bodyFormat?: "json";
  authProfileId?: string;
  /**
   * Source API timeout in milliseconds. Omitted means the server default
   * (ANALYTICS_DEFAULT_SOURCE_TIMEOUT_MS); the server clamps it to its ceiling.
   */
  timeoutMs?: number;
};
export type AnalyticsFilter = {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
};

/**
 * A measure's own viewer toolbar (Separate layout only). The viewer may change
 * exactly the controls enabled here; everything else follows the shared
 * toolbar. Missing on definitions saved before this setting.
 */
export type MeasureToolbarConfig = {
  enabled: boolean;
  /** Chart types the viewer may switch between; fewer than two hides the switch. */
  chartTypes: TimeSeriesChartType[];
  allowBucket: boolean;
  /** Uses the definition's Time Range presets and custom setting. */
  allowTimeRange: boolean;
};
/** One plotted property of a time series (e.g. Y.telemetry.Temperature). */
export type TimeSeriesMeasure = {
  id: string;
  field: string;
  label: string;
  unit: string;
  /** Hex color; empty uses the palette. */
  color: string;
  /** Overrides the definition chart type for this measure; empty inherits. */
  chartType: TimeSeriesChartType | "";
  decimals: number | null;
  toolbar?: MeasureToolbarConfig;
};
export type TimeSeriesConfig = {
  timeField: string;
  measures: TimeSeriesMeasure[];
  layout: TimeSeriesLayout;
  chartType: TimeSeriesChartType;
  bucket: TimeBucket;
  bucketAggregation: BucketAggregation;
  maxPoints: number;
  showPoints: boolean;
  smooth: boolean;
  zoom: boolean;
};
export type TimeRangeConfig = {
  enabled: boolean;
  /** Aggregate mode only: the record field the range filters on. */
  field: string;
  defaultPreset: TimeRangePreset;
  presets: TimeRangePreset[];
  allowCustom: boolean;
  /** Optional runtime parameter names passed to the source as {{name}}. */
  fromParam: string;
  toParam: string;
  paramFormat: TimeParamFormat;
};
export type RuntimeFilterControl = {
  id: string;
  field: string;
  label: string;
  control: "select" | "text" | "number";
  operator: FilterOperator;
  /** "bib": Integration Hub filters records; "source": value goes to {{param}}. */
  applyIn: FilterMode;
  param: string;
  options: string[];
  optionsFromData: boolean;
  defaultValue: string;
};
export type ViewerToolbarConfig = {
  enabled: boolean;
  /** Chart types the viewer may switch between; empty hides the switch. */
  chartTypes: (VisualizationType | TimeSeriesChartType)[];
  allowLayout: boolean;
  allowMeasureToggle: boolean;
  allowBucket: boolean;
  filters: RuntimeFilterControl[];
};

export type AnalyticsDefinition = {
  id: string;
  organizationId: string;
  organizationName?: string;
  name: string;
  description: string;
  status: AnalyticsStatus;
  mode?: AnalyticsMode;
  /** Not returned for published (anonymous) views. */
  dataSource: {
    type: "rest";
    action: AnalyticsApiAction;
    arrayPath: string;
  };
  queryParams: string[];
  filterMode: FilterMode;
  filters: AnalyticsFilter[];
  dimension: string;
  measure: string;
  aggregation: AggregationType;
  timeSeries?: TimeSeriesConfig;
  timeRange?: TimeRangeConfig;
  toolbar?: ViewerToolbarConfig;
  visualization: {
    type: VisualizationType;
    title: string;
    showLegend: boolean;
    showLabels: boolean;
    theme?: AnalyticsTheme;
    appearance?: AnalyticsAppearance;
  };
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
};
export type AnalyticsRow = Record<string, unknown>;
export type AnalyticsRecordsPathCandidate = {
  path: string;
  count: number;
  fields: string[];
};
export type AnalyticsFieldType = "number" | "date" | "string";
/** [epoch milliseconds, value] */
export type TimeSeriesPoint = [number, number];
export type TimeSeriesResult = {
  id: string;
  field: string;
  label: string;
  unit: string;
  color: string;
  chartType: TimeSeriesChartType | "";
  decimals: number | null;
  points: TimeSeriesPoint[];
  stats: {
    count: number;
    min: number | null;
    max: number | null;
    avg: number | null;
    last: number | null;
  };
  sourcePoints: number;
  downsampled: boolean;
  /** Effective range and interval of this series (may differ per measure). */
  timeRange?: ResolvedTimeRange | null;
  bucket?: TimeBucket;
  /** Set when only this measure failed; the others still render. */
  error?: { code: string; message: string };
};
export type ResolvedTimeRange = {
  from: number | null;
  to: number | null;
  preset: TimeRangePreset | "custom";
};
export type AnalyticsResult = {
  mode?: AnalyticsMode;
  rows: AnalyticsRow[];
  rawCount: number;
  filteredCount: number;
  fields: string[];
  fieldTypes?: Record<string, AnalyticsFieldType>;
  recordsPath: string;
  recordsPathCandidates: AnalyticsRecordsPathCandidate[];
  recommendedRecordsPath?: string;
  series?: TimeSeriesResult[];
  extent?: { from: number; to: number } | null;
  unparsedTimeCount?: number;
  timeRange?: ResolvedTimeRange | null;
  bucket?: TimeBucket;
  filterOptions?: Record<string, string[]>;
  /** Measure ids of a partial run; absent on a full run. */
  partial?: string[];
  /** Source API call metrics for the builder. */
  source?: {
    durationMs: number;
    timeoutMs: number;
    /** Source requests actually sent (cache hits excluded). */
    calls?: number;
    cacheHits?: number;
  };
};
/** Server-side bounds the builder shows next to its settings. */
export type AnalyticsBuilderLimits = {
  sourceTimeoutMs: { default: number; min: number; max: number };
  /** Optional: absent on servers older than per-measure toolbars. */
  sourceCalls?: { maxPerRun: number };
  /** Analytics Pages bounds; absent on servers without Analytics Pages. */
  pages?: { maxItems: number; maxRules: number; maxParameters: number };
};
/** Viewer input that the server validates against the definition. */
export type AnalyticsRuntimeInput = {
  preset?: TimeRangePreset;
  from?: string;
  to?: string;
  bucket?: TimeBucket;
  filters?: Record<string, string>;
  /** Per-measure controls, validated against each measure's own toolbar. */
  measures?: Record<string, MeasureRuntimeInput>;
  /** Skip the source response cache (the toolbar's Refresh button). */
  fresh?: boolean;
  /** Partial run: compute only these measures (their own toolbar changed). */
  only?: string[];
};
export type MeasureRuntimeInput = {
  preset?: TimeRangePreset;
  from?: string;
  to?: string;
  bucket?: TimeBucket;
};
export type Organization = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};
