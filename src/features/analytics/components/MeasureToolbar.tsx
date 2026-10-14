import { RotateCcw } from "lucide-react";
import type { TimeSeriesChartType } from "../model/analytics.types";
import {
  TIMESERIES_CHART_TYPES,
  presetLabel,
  type CompleteAnalyticsDefinition,
  type CompleteTimeSeriesMeasure,
} from "../model/analyticsCatalog";
import {
  defaultMeasureChartType,
  measureControls,
} from "../services/analyticsMeasureView";
import type {
  AnalyticsViewState,
  MeasureViewState,
} from "../services/analyticsViewState";
import {
  ChartTypeControl,
  INHERIT,
  IntervalControl,
  TimeRangeControl,
  bucketLabel,
} from "./toolbarControls";

type Props = {
  definition: CompleteAnalyticsDefinition;
  measure: CompleteTimeSeriesMeasure;
  /** The viewer state; shared values are shown as the "inherit" choice. */
  state: AnalyticsViewState;
  /** Shared chart type currently shown (viewer or definition). */
  sharedChartType: TimeSeriesChartType;
  onChange: (next: MeasureViewState) => void;
};

/**
 * A measure's own toolbar, shown in its chart header (Separate layout). Its
 * choices persist when the shared toolbar changes; "Use shared" clears them.
 */
export function MeasureToolbar({
  definition: d,
  measure,
  state,
  sharedChartType,
  onChange,
}: Props) {
  const controls = measureControls(d, measure);
  const own = state.measures[measure.id] ?? {};
  const set = (patch: Partial<MeasureViewState>) => {
    const next: MeasureViewState = { ...own, ...patch };
    // Drop cleared fields so the URL and runtime input stay minimal.
    for (const key of Object.keys(next) as (keyof MeasureViewState)[])
      if (!next[key]) delete next[key];
    onChange(next);
  };

  const sharedRangeLabel =
    state.preset === "custom" ? "Custom range" : presetLabel(state.preset);
  const sharedBucket = state.bucket || d.timeSeries.bucket;
  const defaultType = defaultMeasureChartType(measure, sharedChartType);
  const chartOptions = TIMESERIES_CHART_TYPES.filter((t) =>
    controls.chartTypes.includes(t.value),
  );
  const changed = Object.keys(own).length > 0;

  return (
    <div
      className="an-measure-toolbar"
      role="toolbar"
      aria-label={`${measure.label || measure.field} controls`}
    >
      {controls.timeRange && (
        <TimeRangeControl
          compact
          config={d.timeRange}
          label="Range"
          inherit={{ label: `Shared (${sharedRangeLabel})` }}
          value={{
            preset: own.preset ?? INHERIT,
            from: own.from ?? "",
            to: own.to ?? "",
          }}
          onChange={(next) =>
            set({
              preset: next.preset || undefined,
              from: next.from || undefined,
              to: next.to || undefined,
            })
          }
        />
      )}
      {controls.bucket && (
        <IntervalControl
          compact
          inherit={{ label: `Shared (${bucketLabel(sharedBucket)})` }}
          value={own.bucket ?? INHERIT}
          onChange={(bucket) => set({ bucket: bucket || undefined })}
        />
      )}
      {chartOptions.length > 1 && (
        <ChartTypeControl
          compact
          options={chartOptions}
          value={own.chartType ?? defaultType}
          onChange={(type) =>
            set({ chartType: type === defaultType ? undefined : type })
          }
        />
      )}
      <button
        className="icon-button an-measure-reset"
        title="Use the shared toolbar for this chart"
        aria-label="Use shared settings"
        disabled={!changed}
        onClick={() => onChange({})}
      >
        <RotateCcw size={14} />
      </button>
    </div>
  );
}
