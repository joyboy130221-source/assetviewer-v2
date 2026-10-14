import type {
  AnalyticsMode,
  TimeRangeConfig,
  TimeRangePreset,
} from "../../model/analytics.types";
import { TIME_RANGE_PRESETS } from "../../model/analyticsCatalog";

type Props = {
  mode: AnalyticsMode;
  value: TimeRangeConfig;
  onChange: (value: TimeRangeConfig) => void;
};

const PARAM_PATTERN = "[A-Za-z_][A-Za-z0-9_]*";

export function TimeRangeEditor({ mode, value, onChange }: Props) {
  const set = (patch: Partial<TimeRangeConfig>) =>
    onChange({ ...value, ...patch });
  const togglePreset = (preset: TimeRangePreset) =>
    set({
      presets: value.presets.includes(preset)
        ? value.presets.filter((p) => p !== preset)
        : TIME_RANGE_PRESETS.map((p) => p.value).filter(
            (p) => p === preset || value.presets.includes(p),
          ),
    });
  return (
    <div className="an-range-editor">
      <label className="an-check">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />{" "}
        Let viewers choose the time range
      </label>
      {value.enabled && (
        <>
          {mode === "aggregate" && (
            <label>
              Time field
              <input
                list="analytics-source-fields"
                placeholder="createdAt"
                value={value.field}
                onChange={(e) => set({ field: e.target.value })}
              />
              <small>
                Records outside the range are excluded before aggregation.
              </small>
            </label>
          )}
          <div className="an-fields two">
            <label>
              Default range
              <select
                value={value.defaultPreset}
                onChange={(e) =>
                  set({ defaultPreset: e.target.value as TimeRangePreset })
                }
              >
                {TIME_RANGE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="an-check an-align-end">
              <input
                type="checkbox"
                checked={value.allowCustom}
                onChange={(e) => set({ allowCustom: e.target.checked })}
              />{" "}
              Allow a custom from/to range
            </label>
          </div>
          <div className="an-checklist">
            <b>Ranges offered in the toolbar</b>
            <div>
              {TIME_RANGE_PRESETS.map((p) => (
                <label key={p.value} className="an-check">
                  <input
                    type="checkbox"
                    checked={
                      value.presets.includes(p.value) ||
                      p.value === value.defaultPreset
                    }
                    disabled={p.value === value.defaultPreset}
                    onChange={() => togglePreset(p.value)}
                  />{" "}
                  {p.label}
                </label>
              ))}
            </div>
          </div>
          <div className="an-fields three">
            <label>
              Send start as parameter
              <input
                placeholder="startTime"
                pattern={PARAM_PATTERN}
                value={value.fromParam}
                onChange={(e) => set({ fromParam: e.target.value.trim() })}
              />
            </label>
            <label>
              Send end as parameter
              <input
                placeholder="endTime"
                pattern={PARAM_PATTERN}
                value={value.toParam}
                onChange={(e) => set({ toParam: e.target.value.trim() })}
              />
            </label>
            <label>
              Parameter format
              <select
                value={value.paramFormat}
                onChange={(e) =>
                  set({
                    paramFormat: e.target
                      .value as TimeRangeConfig["paramFormat"],
                  })
                }
              >
                <option value="iso">ISO 8601 (UTC)</option>
                <option value="epochMs">Epoch milliseconds</option>
                <option value="epochS">Epoch seconds</option>
              </select>
            </label>
          </div>
          <small className="an-hint">
            When the source API supports a time window, name the parameters here
            and use them in the endpoint or query parameters, e.g.{" "}
            <code>{"{{startTime}}"}</code>. Integration Hub always filters the
            returned records to the chosen range as well, so leaving these empty
            still works for smaller result sets.
          </small>
        </>
      )}
    </div>
  );
}
