import { Fragment, useMemo } from "react";
import { Plus, SlidersHorizontal, Trash2, Wand2, X } from "lucide-react";
import type {
  AnalyticsAppearance,
  AnalyticsFieldType,
  MeasureToolbarConfig,
  TimeRangeConfig,
  TimeSeriesConfig,
} from "../../model/analytics.types";
import {
  BUCKET_AGGREGATIONS,
  DEFAULT_MEASURE_TOOLBAR,
  TIME_BUCKETS,
  TIMESERIES_CHART_TYPES,
  type CompleteAnalyticsDefinition,
  type CompleteTimeSeriesMeasure,
} from "../../model/analyticsCatalog";
import { MeasureToolbarEditor } from "./MeasureToolbarEditor";
import { colorForSeries } from "../../services/analyticsAppearance";
import { createId } from "../../../../shared/workflow/createId";

type TimeSeriesValue = CompleteAnalyticsDefinition["timeSeries"];
type Props = {
  value: TimeSeriesValue;
  onChange: (value: TimeSeriesValue) => void;
  fields: string[];
  fieldTypes: Record<string, AnalyticsFieldType>;
  appearance?: AnalyticsAppearance;
  /** For per-measure toolbar hints (time range on/off, sent to source). */
  timeRange: TimeRangeConfig;
  /** ANALYTICS_MAX_SOURCE_CALLS_PER_RUN, when the server reports it. */
  maxSourceCalls?: number;
};

const leaf = (path: string) => path.split(".").pop() ?? path;
const parentOf = (path: string) => path.split(".").slice(0, -1).join(".");

const newMeasure = (field = ""): CompleteTimeSeriesMeasure => ({
  id: createId(),
  field,
  label: field ? leaf(field) : "",
  unit: "",
  color: "",
  chartType: "",
  decimals: null,
  toolbar: { ...DEFAULT_MEASURE_TOOLBAR },
});

/** Turning a toolbar on with nothing selected pre-selects Interval. */
function toggledToolbar(toolbar: MeasureToolbarConfig): MeasureToolbarConfig {
  if (toolbar.enabled) return { ...toolbar, enabled: false };
  const empty =
    !toolbar.allowBucket &&
    !toolbar.allowTimeRange &&
    !toolbar.chartTypes.length;
  return {
    ...toolbar,
    enabled: true,
    allowBucket: empty || toolbar.allowBucket,
  };
}

export function TimeSeriesEditor({
  value,
  onChange,
  fields,
  fieldTypes,
  appearance,
  timeRange,
  maxSourceCalls,
}: Props) {
  const set = (patch: Partial<TimeSeriesValue>) =>
    onChange({ ...value, ...patch });
  const setMeasure = (
    index: number,
    patch: Partial<CompleteTimeSeriesMeasure>,
  ) =>
    set({
      measures: value.measures.map((m, i) =>
        i === index ? { ...m, ...patch } : m,
      ),
    });

  const dateFields = fields.filter((f) => fieldTypes[f] === "date");
  const numericFields = fields.filter((f) => fieldTypes[f] === "number");

  /** Numeric fields grouped by parent object, e.g. "Y.telemetry" → 6 fields. */
  const groups = useMemo(() => {
    const used = new Set(value.measures.map((m) => m.field));
    const byParent = new Map<string, string[]>();
    for (const f of numericFields) {
      if (used.has(f)) continue;
      const parent = parentOf(f) || "(top level)";
      byParent.set(parent, [...(byParent.get(parent) ?? []), f]);
    }
    return [...byParent.entries()].filter(([, list]) => list.length > 1);
  }, [numericFields, value.measures]);

  return (
    <div className="an-ts-editor">
      <datalist id="analytics-date-fields">
        {(dateFields.length ? dateFields : fields).map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <datalist id="analytics-number-fields">
        {(numericFields.length ? numericFields : fields).map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      <label>
        Time field
        <input
          list="analytics-date-fields"
          placeholder="e.g. X or timestamp"
          value={value.timeField}
          onChange={(e) => set({ timeField: e.target.value })}
        />
        <small>
          ISO dates or epoch numbers (seconds or milliseconds) are supported.
        </small>
      </label>

      <div className="an-section-title">
        <b>Measures</b>
        <button
          className="secondary-button"
          onClick={() => set({ measures: [...value.measures, newMeasure()] })}
        >
          <Plus size={14} /> Add measure
        </button>
      </div>
      {groups.length > 0 && (
        <div className="an-ts-suggest">
          {groups.map(([parent, list]) => (
            <button
              key={parent}
              className="secondary-button"
              onClick={() =>
                set({
                  measures: [
                    ...value.measures,
                    ...list.map((f) => newMeasure(f)),
                  ],
                })
              }
            >
              <Wand2 size={14} /> Add {list.length} numeric fields under{" "}
              <code>{parent}</code>
            </button>
          ))}
        </div>
      )}
      {!value.measures.length && (
        <small className="an-hint">
          Run Test &amp; Preview to discover fields, then add the properties to
          plot.
        </small>
      )}
      {value.measures.length > 0 && (
        <div className="an-measure-table" role="table" aria-label="Measures">
          <div className="an-measure-row head" role="row">
            <span>Field</span>
            <span>Label</span>
            <span>Unit</span>
            <span>Chart</span>
            <span>Decimals</span>
            <span>Color</span>
            <span title="A toolbar on this measure's own chart">Toolbar</span>
            <span />
          </div>
          {value.measures.map((m, index) => (
            <Fragment key={m.id}>
              <div className="an-measure-row" role="row">
                <input
                  list="analytics-number-fields"
                  aria-label="Field"
                  value={m.field}
                  onChange={(e) =>
                    setMeasure(index, {
                      field: e.target.value,
                      label:
                        m.label && m.label !== leaf(m.field)
                          ? m.label
                          : leaf(e.target.value),
                    })
                  }
                />
                <input
                  aria-label="Label"
                  value={m.label}
                  onChange={(e) => setMeasure(index, { label: e.target.value })}
                />
                <input
                  aria-label="Unit"
                  placeholder="kWh"
                  value={m.unit}
                  onChange={(e) => setMeasure(index, { unit: e.target.value })}
                />
                <select
                  aria-label="Chart type"
                  value={m.chartType}
                  onChange={(e) =>
                    setMeasure(index, {
                      chartType: e.target
                        .value as CompleteTimeSeriesMeasure["chartType"],
                    })
                  }
                >
                  <option value="">Default</option>
                  {TIMESERIES_CHART_TYPES.filter(
                    (t) => t.value !== "table",
                  ).map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Decimals"
                  type="number"
                  min={0}
                  max={8}
                  placeholder="Auto"
                  value={m.decimals ?? ""}
                  onChange={(e) =>
                    setMeasure(index, {
                      decimals:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
                <div className="an-measure-color">
                  <input
                    type="color"
                    aria-label="Color"
                    value={colorForSeries(m.color, index, appearance)}
                    onChange={(e) =>
                      setMeasure(index, { color: e.target.value })
                    }
                  />
                  {m.color && (
                    <button
                      title="Use palette color"
                      onClick={() => setMeasure(index, { color: "" })}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <button
                  className={`an-chip an-measure-tb-toggle${m.toolbar.enabled ? " on" : ""}`}
                  aria-pressed={m.toolbar.enabled}
                  title={
                    m.toolbar.enabled
                      ? "This chart has its own toolbar"
                      : "Uses the shared toolbar. Click to give this chart its own toolbar."
                  }
                  onClick={() =>
                    setMeasure(index, { toolbar: toggledToolbar(m.toolbar) })
                  }
                >
                  <SlidersHorizontal size={13} />
                  {m.toolbar.enabled ? "Own" : "Shared"}
                </button>
                <button
                  className="an-icon-plain"
                  title="Remove measure"
                  onClick={() =>
                    set({
                      measures: value.measures.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {m.toolbar.enabled && (
                <div className="an-measure-subrow" role="row">
                  <MeasureToolbarEditor
                    value={m.toolbar}
                    onChange={(toolbar) => setMeasure(index, { toolbar })}
                    timeRange={timeRange}
                    layout={value.layout}
                    maxSourceCalls={maxSourceCalls}
                  />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      )}

      <div className="an-fields three">
        <label>
          Layout
          <select
            value={value.layout}
            onChange={(e) =>
              set({ layout: e.target.value as TimeSeriesConfig["layout"] })
            }
          >
            <option value="separate">Separate chart per measure</option>
            <option value="combined">All measures on one chart</option>
          </select>
        </label>
        <label>
          Chart type
          <select
            value={value.chartType}
            onChange={(e) =>
              set({
                chartType: e.target.value as TimeSeriesConfig["chartType"],
              })
            }
          >
            {TIMESERIES_CHART_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Max points per series
          <input
            type="number"
            min={100}
            step={100}
            value={value.maxPoints}
            onChange={(e) => set({ maxPoints: Number(e.target.value) || 2000 })}
          />
        </label>
      </div>
      <div className="an-fields two">
        <label>
          Interval
          <select
            value={value.bucket}
            onChange={(e) =>
              set({ bucket: e.target.value as TimeSeriesConfig["bucket"] })
            }
          >
            {TIME_BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Value per interval
          <select
            disabled={value.bucket === "raw"}
            value={value.bucketAggregation}
            onChange={(e) =>
              set({
                bucketAggregation: e.target
                  .value as TimeSeriesConfig["bucketAggregation"],
              })
            }
          >
            {BUCKET_AGGREGATIONS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="an-visual-toggles">
        <label className="an-check">
          <input
            type="checkbox"
            checked={value.showPoints}
            onChange={(e) => set({ showPoints: e.target.checked })}
          />{" "}
          Show points
        </label>
        <label className="an-check">
          <input
            type="checkbox"
            checked={value.smooth}
            onChange={(e) => set({ smooth: e.target.checked })}
          />{" "}
          Smooth lines
        </label>
        <label className="an-check">
          <input
            type="checkbox"
            checked={value.zoom}
            onChange={(e) => set({ zoom: e.target.checked })}
          />{" "}
          Zoom &amp; pan
        </label>
      </div>
    </div>
  );
}
