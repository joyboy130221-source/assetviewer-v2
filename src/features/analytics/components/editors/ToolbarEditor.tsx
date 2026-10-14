import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  AnalyticsMode,
  FilterOperator,
  RuntimeFilterControl,
  ViewerToolbarConfig,
} from "../../model/analytics.types";
import {
  AGGREGATE_CHART_TYPES,
  TIMESERIES_CHART_TYPES,
} from "../../model/analyticsCatalog";
import { createId } from "../../../../shared/workflow/createId";

type Props = {
  mode: AnalyticsMode;
  value: ViewerToolbarConfig;
  onChange: (value: ViewerToolbarConfig) => void;
};

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "equals", label: "=" },
  { value: "notEquals", label: "≠" },
  { value: "contains", label: "contains" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
];

const newFilter = (): RuntimeFilterControl => ({
  id: createId(),
  field: "",
  label: "",
  control: "select",
  operator: "equals",
  applyIn: "bib",
  param: "",
  options: [],
  optionsFromData: true,
  defaultValue: "",
});

/** Comma-separated list edited as free text and parsed on blur. */
function OptionsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState(value.join(", "));
  useEffect(() => setDraft(value.join(", ")), [value]);
  return (
    <input
      value={draft}
      placeholder="1, 2, 3"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() =>
        onChange(
          draft
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean),
        )
      }
    />
  );
}

export function ToolbarEditor({ mode, value, onChange }: Props) {
  const set = (patch: Partial<ViewerToolbarConfig>) =>
    onChange({ ...value, ...patch });
  const setFilter = (index: number, patch: Partial<RuntimeFilterControl>) =>
    set({
      filters: value.filters.map((f, i) =>
        i === index ? { ...f, ...patch } : f,
      ),
    });
  const types =
    mode === "timeseries" ? TIMESERIES_CHART_TYPES : AGGREGATE_CHART_TYPES;
  const toggleType = (type: string) =>
    set({
      chartTypes: value.chartTypes.includes(type as never)
        ? value.chartTypes.filter((t) => t !== type)
        : types
            .map((t) => t.value)
            .filter((t) => t === type || value.chartTypes.includes(t)),
    });

  return (
    <div className="an-toolbar-editor">
      <label className="an-check">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />{" "}
        Show a toolbar on the published chart
      </label>
      {value.enabled && (
        <>
          <div className="an-checklist">
            <b>Chart types viewers can switch to</b>
            <div>
              {types.map((t) => (
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
            <small>
              Pick two or more to show the switch. The configured type stays the
              default.
            </small>
          </div>
          {mode === "timeseries" && (
            <div className="an-visual-toggles">
              <label className="an-check">
                <input
                  type="checkbox"
                  checked={value.allowLayout}
                  onChange={(e) => set({ allowLayout: e.target.checked })}
                />{" "}
                Separate / combined switch
              </label>
              <label className="an-check">
                <input
                  type="checkbox"
                  checked={value.allowMeasureToggle}
                  onChange={(e) =>
                    set({ allowMeasureToggle: e.target.checked })
                  }
                />{" "}
                Show / hide measures
              </label>
              <label className="an-check">
                <input
                  type="checkbox"
                  checked={value.allowBucket}
                  onChange={(e) => set({ allowBucket: e.target.checked })}
                />{" "}
                Interval selector
              </label>
            </div>
          )}
          {mode === "timeseries" && (
            <small className="an-hint">
              This toolbar applies to all measures. To give one chart its own
              time range, interval or chart type, set its Toolbar to Own under
              Measures (Separate layout).
            </small>
          )}

          <div className="an-section-title">
            <b>Viewer filters</b>
            <button
              className="secondary-button"
              onClick={() => set({ filters: [...value.filters, newFilter()] })}
            >
              <Plus size={14} /> Add filter
            </button>
          </div>
          {value.filters.map((f, index) => (
            <div className="an-runtime-filter" key={f.id}>
              <div className="an-fields three">
                <label>
                  Label
                  <input
                    placeholder="Panel status"
                    value={f.label}
                    onChange={(e) =>
                      setFilter(index, { label: e.target.value })
                    }
                  />
                </label>
                <label>
                  Applied by
                  <select
                    value={f.applyIn}
                    onChange={(e) =>
                      setFilter(index, {
                        applyIn: e.target
                          .value as RuntimeFilterControl["applyIn"],
                      })
                    }
                  >
                    <option value="bib">
                      Integration Hub (filter records)
                    </option>
                    <option value="source">Source API (parameter)</option>
                  </select>
                </label>
                <label>
                  Control
                  <select
                    value={f.control}
                    onChange={(e) =>
                      setFilter(index, {
                        control: e.target
                          .value as RuntimeFilterControl["control"],
                      })
                    }
                  >
                    <option value="select">Dropdown</option>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                  </select>
                </label>
              </div>
              <div className="an-fields three">
                {f.applyIn === "bib" ? (
                  <>
                    <label>
                      Field
                      <input
                        list="analytics-source-fields"
                        value={f.field}
                        onChange={(e) =>
                          setFilter(index, { field: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Operator
                      <select
                        value={f.operator}
                        onChange={(e) =>
                          setFilter(index, {
                            operator: e.target.value as FilterOperator,
                          })
                        }
                      >
                        {OPERATORS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <label>
                    Parameter name
                    <input
                      placeholder="siteId"
                      value={f.param}
                      onChange={(e) =>
                        setFilter(index, { param: e.target.value.trim() })
                      }
                    />
                    <small>
                      Use <code>{`{{${f.param || "siteId"}}}`}</code> in the
                      endpoint or query parameters.
                    </small>
                  </label>
                )}
                <label>
                  Default value
                  <input
                    placeholder="All"
                    value={f.defaultValue}
                    onChange={(e) =>
                      setFilter(index, { defaultValue: e.target.value })
                    }
                  />
                </label>
              </div>
              {f.control === "select" && (
                <div className="an-fields two">
                  {f.applyIn === "bib" && (
                    <label className="an-check an-align-end">
                      <input
                        type="checkbox"
                        checked={f.optionsFromData}
                        onChange={(e) =>
                          setFilter(index, {
                            optionsFromData: e.target.checked,
                          })
                        }
                      />{" "}
                      Options from the data
                    </label>
                  )}
                  {(f.applyIn === "source" || !f.optionsFromData) && (
                    <label>
                      Options (comma separated)
                      <OptionsInput
                        value={f.options}
                        onChange={(options) => setFilter(index, { options })}
                      />
                    </label>
                  )}
                </div>
              )}
              <button
                className="an-icon-plain an-runtime-filter-remove"
                title="Remove filter"
                onClick={() =>
                  set({ filters: value.filters.filter((_, i) => i !== index) })
                }
              >
                <Trash2 size={15} /> Remove
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
