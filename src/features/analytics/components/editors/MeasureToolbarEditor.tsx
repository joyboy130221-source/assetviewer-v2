import type {
  MeasureToolbarConfig,
  TimeRangeConfig,
  TimeSeriesChartType,
  TimeSeriesLayout,
} from "../../model/analytics.types";
import { TIMESERIES_CHART_TYPES } from "../../model/analyticsCatalog";

type Props = {
  value: MeasureToolbarConfig;
  onChange: (value: MeasureToolbarConfig) => void;
  /** Definition context, used only for hints and disabled states. */
  timeRange: Pick<TimeRangeConfig, "enabled" | "fromParam" | "toParam">;
  layout: TimeSeriesLayout;
  /** ANALYTICS_MAX_SOURCE_CALLS_PER_RUN, when the server reports it. */
  maxSourceCalls?: number;
};

/**
 * Which controls a measure's own toolbar offers to viewers. Everything not
 * enabled here follows the shared toolbar.
 */
export function MeasureToolbarEditor({
  value,
  onChange,
  timeRange,
  layout,
  maxSourceCalls,
}: Props) {
  const set = (patch: Partial<MeasureToolbarConfig>) =>
    onChange({ ...value, ...patch });
  const toggleType = (type: TimeSeriesChartType) =>
    set({
      // Keep catalog order so the switch is stable whatever the click order.
      chartTypes: TIMESERIES_CHART_TYPES.map((t) => t.value).filter((t) =>
        t === type
          ? !value.chartTypes.includes(t)
          : value.chartTypes.includes(t),
      ),
    });
  const sendsRange = !!(timeRange.fromParam || timeRange.toParam);
  const noControls =
    value.chartTypes.length < 2 && !value.allowBucket && !value.allowTimeRange;

  return (
    <div className="an-measure-toolbar-editor">
      <div className="an-visual-toggles">
        <label className="an-check">
          <input
            type="checkbox"
            checked={value.allowBucket}
            onChange={(e) => set({ allowBucket: e.target.checked })}
          />{" "}
          Interval
        </label>
        <label
          className="an-check"
          title={timeRange.enabled ? "" : "Enable Time Range first"}
        >
          <input
            type="checkbox"
            disabled={!timeRange.enabled}
            checked={value.allowTimeRange && timeRange.enabled}
            onChange={(e) => set({ allowTimeRange: e.target.checked })}
          />{" "}
          Time range
        </label>
      </div>
      <div className="an-checklist">
        <b>Chart types</b>
        <div>
          {TIMESERIES_CHART_TYPES.map((t) => (
            <label key={t.value} className="an-check">
              <input
                type="checkbox"
                checked={value.chartTypes.includes(t.value)}
                onChange={() => toggleType(t.value)}
              />{" "}
              {t.label}
            </label>
          ))}
        </div>
      </div>
      {noControls && (
        <small className="an-hint">
          Pick at least one control (two or more chart types for the chart
          switch), otherwise this chart shows no toolbar.
        </small>
      )}
      {layout === "combined" && (
        <small className="an-hint">
          Own toolbars show only in Separate layout. In Combined layout this
          measure follows the shared toolbar.
        </small>
      )}
      {!timeRange.enabled && (
        <small className="an-hint">
          Time range per measure needs Time Range to be enabled.
        </small>
      )}
      {value.allowTimeRange && timeRange.enabled && (
        <small>
          {sendsRange
            ? `The time range is sent to the source, so each different range is its own source call. Measures with the same range share one call${maxSourceCalls ? `, up to ${maxSourceCalls} calls per view` : ""}.`
            : "Each range is cut from the same source response, so this adds no source calls."}{" "}
          When charts show different ranges, zoom and crosshair are no longer
          linked.
        </small>
      )}
    </div>
  );
}
