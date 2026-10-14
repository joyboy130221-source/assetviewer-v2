import type {
  AnalyticsDefinition,
  BucketAggregation,
  MeasureToolbarConfig,
  TimeBucket,
  TimeRangeConfig,
  TimeRangePreset,
  TimeSeriesChartType,
  TimeSeriesConfig,
  TimeSeriesMeasure,
  ViewerToolbarConfig,
  VisualizationType,
} from "./analytics.types";

/** UI labels. The server (analytics-definition.js) is the authority on values. */
export const TIME_RANGE_PRESETS: { value: TimeRangePreset; label: string }[] = [
  { value: "15m", label: "Last 15 minutes" },
  { value: "1h", label: "Last hour" },
  { value: "4h", label: "Last 4 hours" },
  { value: "12h", label: "Last 12 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All data" },
];

export const TIME_BUCKETS: { value: TimeBucket; label: string }[] = [
  { value: "raw", label: "Raw readings" },
  { value: "1m", label: "1 minute" },
  { value: "5m", label: "5 minutes" },
  { value: "15m", label: "15 minutes" },
  { value: "30m", label: "30 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "6h", label: "6 hours" },
  { value: "1d", label: "1 day" },
];

export const BUCKET_AGGREGATIONS: {
  value: BucketAggregation;
  label: string;
}[] = [
  { value: "avg", label: "Average" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
  { value: "sum", label: "Sum" },
  { value: "last", label: "Last value" },
  { value: "count", label: "Count" },
];

export const TIMESERIES_CHART_TYPES: {
  value: TimeSeriesChartType;
  label: string;
}[] = [
  { value: "line", label: "Line" },
  { value: "step", label: "Step" },
  { value: "area", label: "Area" },
  { value: "bar", label: "Bar" },
  { value: "scatter", label: "Points" },
  { value: "table", label: "Table" },
];

export const AGGREGATE_CHART_TYPES: {
  value: VisualizationType;
  label: string;
}[] = [
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "pie", label: "Pie" },
  { value: "table", label: "Table" },
  { value: "kpi", label: "KPI" },
];

export const DEFAULT_TIME_SERIES: TimeSeriesConfig = {
  timeField: "",
  measures: [],
  layout: "separate",
  chartType: "line",
  bucket: "raw",
  bucketAggregation: "avg",
  maxPoints: 2000,
  showPoints: true,
  smooth: false,
  zoom: true,
};

export const DEFAULT_TIME_RANGE: TimeRangeConfig = {
  enabled: false,
  field: "",
  defaultPreset: "24h",
  presets: ["1h", "4h", "24h", "7d"],
  allowCustom: true,
  fromParam: "",
  toParam: "",
  paramFormat: "iso",
};

export const DEFAULT_TOOLBAR: ViewerToolbarConfig = {
  enabled: false,
  chartTypes: [],
  allowLayout: true,
  allowMeasureToggle: true,
  allowBucket: true,
  filters: [],
};

/** Same as the server's normalization of a missing measure toolbar. */
export const DEFAULT_MEASURE_TOOLBAR: MeasureToolbarConfig = {
  enabled: false,
  chartTypes: [],
  allowBucket: false,
  allowTimeRange: false,
};

/** A measure with its optional settings filled in. */
export type CompleteTimeSeriesMeasure = TimeSeriesMeasure & {
  toolbar: MeasureToolbarConfig;
};
/** A definition with every optional (post-V1) section filled in. */
export type CompleteAnalyticsDefinition = Omit<
  AnalyticsDefinition,
  "mode" | "timeSeries" | "timeRange" | "toolbar"
> & {
  mode: NonNullable<AnalyticsDefinition["mode"]>;
  timeSeries: Omit<TimeSeriesConfig, "measures"> & {
    measures: CompleteTimeSeriesMeasure[];
  };
  timeRange: TimeRangeConfig;
  toolbar: ViewerToolbarConfig;
};

function measureWithDefaults(m: TimeSeriesMeasure): CompleteTimeSeriesMeasure {
  return {
    ...m,
    toolbar: m.toolbar
      ? { ...DEFAULT_MEASURE_TOOLBAR, ...m.toolbar }
      : { ...DEFAULT_MEASURE_TOOLBAR },
  };
}

export function withDefaults(
  d: AnalyticsDefinition,
): CompleteAnalyticsDefinition {
  return {
    ...d,
    mode: d.mode ?? "aggregate",
    timeSeries: {
      ...DEFAULT_TIME_SERIES,
      ...(d.timeSeries ?? {}),
      measures: (d.timeSeries?.measures ?? []).map(measureWithDefaults),
    },
    timeRange: { ...DEFAULT_TIME_RANGE, ...(d.timeRange ?? {}) },
    toolbar: { ...DEFAULT_TOOLBAR, ...(d.toolbar ?? {}) },
    visualization: {
      ...d.visualization,
      theme: d.visualization.theme ?? "auto",
    },
  };
}

export const presetLabel = (preset: string) =>
  TIME_RANGE_PRESETS.find((p) => p.value === preset)?.label ?? preset;
