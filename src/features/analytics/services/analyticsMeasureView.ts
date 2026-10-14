import type {
  MeasureRuntimeInput,
  ResolvedTimeRange,
  TimeSeriesChartType,
  TimeSeriesLayout,
  TimeSeriesResult,
} from "../model/analytics.types";
import {
  TIMESERIES_CHART_TYPES,
  type CompleteAnalyticsDefinition,
  type CompleteTimeSeriesMeasure,
} from "../model/analyticsCatalog";
import type {
  AnalyticsViewState,
  MeasureViewState,
} from "./analyticsViewState";

/**
 * Rules for per-measure toolbars, shared by the toolbar, the viewer and the
 * chart so they can never disagree:
 * - a measure's own toolbar exists only in Separate layout;
 * - a viewer override counts only for controls its author enabled;
 * - hidden measures send no overrides (no source call for a chart nobody sees);
 * - charts share zoom and crosshair only while every chart shows the same range.
 */

export const isTimeSeriesChartType = (
  value: string | undefined,
): value is TimeSeriesChartType =>
  !!value && TIMESERIES_CHART_TYPES.some((t) => t.value === value);

/** The layout currently shown (viewer choice, else the definition's). */
export const effectiveLayout = (
  d: CompleteAnalyticsDefinition,
  state: Pick<AnalyticsViewState, "layout">,
): TimeSeriesLayout => state.layout || d.timeSeries.layout;

/** Controls a measure's own toolbar offers (none means no toolbar is shown). */
export function measureControls(
  d: CompleteAnalyticsDefinition,
  measure: CompleteTimeSeriesMeasure,
) {
  const toolbar = measure.toolbar;
  const on = d.mode === "timeseries" && toolbar.enabled;
  return {
    chartTypes: on && toolbar.chartTypes.length > 1 ? toolbar.chartTypes : [],
    bucket: on && toolbar.allowBucket,
    timeRange: on && toolbar.allowTimeRange && d.timeRange.enabled,
  };
}

export function hasMeasureToolbar(
  d: CompleteAnalyticsDefinition,
  measure: CompleteTimeSeriesMeasure,
  layout: TimeSeriesLayout,
): boolean {
  if (layout !== "separate") return false;
  const c = measureControls(d, measure);
  return c.chartTypes.length > 0 || c.bucket || c.timeRange;
}

/**
 * The viewer overrides that are in effect: only measures whose toolbar is
 * shown and visible, and only controls the author enabled. Everything else
 * follows the shared toolbar.
 */
export function activeMeasureOverrides(
  d: CompleteAnalyticsDefinition,
  state: AnalyticsViewState,
): Record<string, MeasureViewState> {
  const layout = effectiveLayout(d, state);
  const active: Record<string, MeasureViewState> = {};
  for (const measure of d.timeSeries.measures) {
    const own = state.measures[measure.id];
    if (!own || state.hidden.includes(measure.id)) continue;
    if (!hasMeasureToolbar(d, measure, layout)) continue;
    const c = measureControls(d, measure);
    const next: MeasureViewState = {};
    if (c.timeRange && own.preset) {
      if (own.preset !== "custom") next.preset = own.preset;
      else if (own.from && own.to)
        Object.assign(next, { preset: "custom", from: own.from, to: own.to });
    }
    if (c.bucket && own.bucket) next.bucket = own.bucket;
    if (own.chartType && c.chartTypes.includes(own.chartType))
      next.chartType = own.chartType;
    if (Object.keys(next).length) active[measure.id] = next;
  }
  return active;
}

/** Server part of the active overrides (chart type is presentation-only). */
export function measureRuntimeInput(
  overrides: Record<string, MeasureViewState>,
): Record<string, MeasureRuntimeInput> | undefined {
  const input: Record<string, MeasureRuntimeInput> = {};
  for (const [id, own] of Object.entries(overrides)) {
    const next: MeasureRuntimeInput = {};
    if (own.preset === "custom")
      Object.assign(next, { from: own.from, to: own.to });
    else if (own.preset) next.preset = own.preset;
    if (own.bucket) next.bucket = own.bucket;
    if (Object.keys(next).length) input[id] = next;
  }
  return Object.keys(input).length ? input : undefined;
}

/**
 * Chart type a measure shows before any per-measure choice: the definition's
 * per-measure type, else the shared (viewer or definition) type.
 */
export const defaultMeasureChartType = (
  measure: Pick<CompleteTimeSeriesMeasure, "chartType">,
  sharedType: TimeSeriesChartType,
): TimeSeriesChartType =>
  sharedType === "table" ? "table" : measure.chartType || sharedType;

/** Viewer-chosen chart type per measure id (only active overrides). */
export const measureChartTypes = (
  overrides: Record<string, MeasureViewState>,
): Record<string, TimeSeriesChartType> =>
  Object.fromEntries(
    Object.entries(overrides)
      .filter(([, own]) => own.chartType)
      .map(([id, own]) => [id, own.chartType as TimeSeriesChartType]),
  );

const sameRange = (
  a: ResolvedTimeRange | null | undefined,
  b: ResolvedTimeRange | null | undefined,
) =>
  (a?.from ?? null) === (b?.from ?? null) &&
  (a?.to ?? null) === (b?.to ?? null);

/**
 * Option 1 of the design: zoom and crosshair are linked while every chart
 * that has data shows the same time range, and unlinked for all of them as
 * soon as one differs. Results from servers without per-series ranges stay
 * linked, as before.
 */
export function chartsLinked(series: TimeSeriesResult[]): boolean {
  const ranged = series.filter((s) => !s.error && s.timeRange !== undefined);
  return ranged.every((s) => sameRange(s.timeRange, ranged[0].timeRange));
}
