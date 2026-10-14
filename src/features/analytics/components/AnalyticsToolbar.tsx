import { useEffect, useState } from "react";
import { Columns2, Layers, RefreshCw, RotateCcw, Rows3 } from "lucide-react";
import type {
  AnalyticsResult,
  RuntimeFilterControl,
} from "../model/analytics.types";
import {
  AGGREGATE_CHART_TYPES,
  TIMESERIES_CHART_TYPES,
  type CompleteAnalyticsDefinition,
} from "../model/analyticsCatalog";
import { colorForSeries } from "../services/analyticsAppearance";
import type { AnalyticsViewState } from "../services/analyticsViewState";
import {
  ChartTypeControl,
  IntervalControl,
  TimeRangeControl,
} from "./toolbarControls";

type Props = {
  definition: CompleteAnalyticsDefinition;
  state: AnalyticsViewState;
  defaults: AnalyticsViewState;
  result: AnalyticsResult | null;
  busy: boolean;
  onChange: (next: AnalyticsViewState) => void;
  onRefresh: () => void;
};

function FilterControl({
  filter,
  value,
  options,
  onChange,
}: {
  filter: RuntimeFilterControl;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const label = filter.label || filter.field.split(".").pop() || filter.param;
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (filter.control === "select")
    return (
      <label className="an-tb-field">
        <span>{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">All</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  // Text and number inputs apply on Enter or blur, not on every keystroke.
  const commit = () => draft !== value && onChange(draft.trim());
  return (
    <label className="an-tb-field">
      <span>{label}</span>
      <input
        type={filter.control === "number" ? "number" : "text"}
        value={draft}
        placeholder="Any"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </label>
  );
}

export function AnalyticsToolbar({
  definition: d,
  state,
  defaults,
  result,
  busy,
  onChange,
  onRefresh,
}: Props) {
  const timeseries = d.mode === "timeseries";
  const toolbar = d.toolbar;
  const range = d.timeRange;
  const set = (patch: Partial<AnalyticsViewState>) =>
    onChange({ ...state, ...patch });
  const chartTypes = (
    timeseries ? TIMESERIES_CHART_TYPES : AGGREGATE_CHART_TYPES
  ).filter((t) => toolbar.chartTypes.includes(t.value));
  const defaultType = timeseries
    ? d.timeSeries.chartType
    : d.visualization.type;
  const activeType = state.chartType || defaultType;
  const measures = d.timeSeries.measures;
  const layout = state.layout || d.timeSeries.layout;

  const toggleMeasure = (id: string) =>
    set({
      hidden: state.hidden.includes(id)
        ? state.hidden.filter((x) => x !== id)
        : [...state.hidden, id],
    });

  const showRange = range.enabled;
  const showToolbar = toolbar.enabled;
  if (!showRange && !showToolbar) return null;

  return (
    <div className="an-toolbar" role="toolbar" aria-label="Chart controls">
      {showRange && (
        <TimeRangeControl
          config={range}
          value={{ preset: state.preset, from: state.from, to: state.to }}
          onChange={(next) =>
            // The shared range never inherits, so "" cannot occur here.
            next.preset &&
            set({ preset: next.preset, from: next.from, to: next.to })
          }
        />
      )}

      {showToolbar && timeseries && toolbar.allowBucket && (
        <IntervalControl
          value={state.bucket || d.timeSeries.bucket}
          onChange={(bucket) =>
            set({ bucket: bucket === d.timeSeries.bucket ? "" : bucket })
          }
        />
      )}

      {showToolbar &&
        toolbar.filters.map((filter) => (
          <FilterControl
            key={filter.id}
            filter={filter}
            value={state.filters[filter.id] ?? ""}
            options={result?.filterOptions?.[filter.id] ?? filter.options}
            onChange={(value) =>
              set({ filters: { ...state.filters, [filter.id]: value } })
            }
          />
        ))}

      {showToolbar && chartTypes.length > 1 && (
        <ChartTypeControl
          options={chartTypes}
          value={activeType}
          onChange={(type) =>
            set({ chartType: type === defaultType ? "" : type })
          }
        />
      )}

      {showToolbar &&
        timeseries &&
        toolbar.allowLayout &&
        measures.length > 1 && (
          <div className="an-tb-field">
            <span>Layout</span>
            <div className="an-segmented" role="radiogroup" aria-label="Layout">
              <button
                role="radio"
                aria-checked={layout === "separate"}
                className={layout === "separate" ? "active" : ""}
                title="One chart per measure"
                onClick={() =>
                  set({
                    layout:
                      d.timeSeries.layout === "separate" ? "" : "separate",
                  })
                }
              >
                <Rows3 size={14} /> Separate
              </button>
              <button
                role="radio"
                aria-checked={layout === "combined"}
                className={layout === "combined" ? "active" : ""}
                title="All measures on one chart"
                onClick={() =>
                  set({
                    layout:
                      d.timeSeries.layout === "combined" ? "" : "combined",
                  })
                }
              >
                <Columns2 size={14} /> Combined
              </button>
            </div>
          </div>
        )}

      {showToolbar &&
        timeseries &&
        toolbar.allowMeasureToggle &&
        measures.length > 1 && (
          <div className="an-tb-field an-tb-measures">
            <span>
              <Layers size={13} /> Measures
            </span>
            <div>
              {measures.map((m, index) => {
                const on = !state.hidden.includes(m.id);
                return (
                  <button
                    key={m.id}
                    className={`an-chip${on ? " on" : ""}`}
                    aria-pressed={on}
                    onClick={() => toggleMeasure(m.id)}
                  >
                    <i
                      style={{
                        backgroundColor: colorForSeries(
                          m.color,
                          index,
                          d.visualization.appearance,
                        ),
                      }}
                    />
                    {m.label || m.field.split(".").pop()}
                  </button>
                );
              })}
            </div>
          </div>
        )}

      <div className="an-tb-actions">
        <button
          className="icon-button"
          title="Refresh"
          disabled={busy}
          onClick={onRefresh}
        >
          <RefreshCw size={15} className={busy ? "an-spin" : ""} />
        </button>
        <button
          className="icon-button"
          title="Reset to default view"
          disabled={busy || JSON.stringify(state) === JSON.stringify(defaults)}
          onClick={() => onChange(defaults)}
        >
          <RotateCcw size={15} />
        </button>
      </div>
    </div>
  );
}
