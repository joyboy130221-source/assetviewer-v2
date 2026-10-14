import { useEffect, useState, type ReactNode } from "react";
import { CalendarClock } from "lucide-react";
import type {
  TimeBucket,
  TimeRangeConfig,
  TimeRangePreset,
} from "../model/analytics.types";
import { TIME_BUCKETS, TIME_RANGE_PRESETS } from "../model/analyticsCatalog";
import { isoToLocalInput, localInputToIso } from "../services/analyticsFormat";

/**
 * Toolbar controls shared by the main viewer toolbar and each measure's own
 * toolbar. Each control is controlled (value + onChange) and optionally offers
 * an "inherit" choice, shown as the first option, whose value is "".
 */

/** Value used by an inheriting control for "follow the shared toolbar". */
export const INHERIT = "" as const;

export type RangeValue = {
  preset: TimeRangePreset | "custom" | typeof INHERIT;
  from: string;
  to: string;
};

type Inherit = { label: string } | undefined;

function Field({
  label,
  compact,
  children,
}: {
  label: ReactNode;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={compact ? "an-tb-field compact" : "an-tb-field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TimeRangeControl({
  config,
  value,
  onChange,
  inherit,
  compact,
  label = "Time range",
}: {
  config: TimeRangeConfig;
  value: RangeValue;
  onChange: (next: RangeValue) => void;
  /** Adds a first option that follows the shared range. */
  inherit?: Inherit;
  compact?: boolean;
  label?: string;
}) {
  const [customFrom, setCustomFrom] = useState(isoToLocalInput(value.from));
  const [customTo, setCustomTo] = useState(isoToLocalInput(value.to));
  useEffect(() => {
    setCustomFrom(isoToLocalInput(value.from));
    setCustomTo(isoToLocalInput(value.to));
  }, [value.from, value.to]);

  const presets = TIME_RANGE_PRESETS.filter(
    (p) => config.presets.includes(p.value) || p.value === config.defaultPreset,
  );
  const applyCustom = () => {
    const from = localInputToIso(customFrom);
    const to = localInputToIso(customTo);
    if (from && to && from < to) onChange({ preset: "custom", from, to });
  };

  return (
    <div className="an-tb-group">
      <Field
        compact={compact}
        label={
          <>
            <CalendarClock size={13} /> {label}
          </>
        }
      >
        <select
          value={value.preset}
          onChange={(e) => {
            const preset = e.target.value as RangeValue["preset"];
            onChange(
              preset === "custom"
                ? { ...value, preset }
                : { preset, from: "", to: "" },
            );
          }}
        >
          {inherit && <option value={INHERIT}>{inherit.label}</option>}
          {presets.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          {config.allowCustom && <option value="custom">Custom range…</option>}
        </select>
      </Field>
      {value.preset === "custom" && (
        <div className="an-tb-custom">
          <input
            type="datetime-local"
            aria-label={`${label} from`}
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
          />
          <span>to</span>
          <input
            type="datetime-local"
            aria-label={`${label} to`}
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
          />
          <button
            className="secondary-button"
            disabled={!customFrom || !customTo || customFrom >= customTo}
            onClick={applyCustom}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

export function IntervalControl({
  value,
  onChange,
  inherit,
  compact,
}: {
  value: TimeBucket | typeof INHERIT;
  onChange: (next: TimeBucket | typeof INHERIT) => void;
  inherit?: Inherit;
  compact?: boolean;
}) {
  return (
    <Field label="Interval" compact={compact}>
      <select
        value={value}
        onChange={(e) =>
          onChange(e.target.value as TimeBucket | typeof INHERIT)
        }
      >
        {inherit && <option value={INHERIT}>{inherit.label}</option>}
        {TIME_BUCKETS.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ChartTypeControl<T extends string>({
  options,
  value,
  onChange,
  compact,
}: {
  options: { value: T; label: string }[];
  /** The type currently shown. */
  value: T;
  onChange: (next: T) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "an-tb-field compact" : "an-tb-field"}>
      <span>Chart</span>
      <div className="an-segmented" role="radiogroup" aria-label="Chart type">
        {options.map((t) => (
          <button
            key={t.value}
            role="radio"
            aria-checked={value === t.value}
            className={value === t.value ? "active" : ""}
            onClick={() => onChange(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const bucketLabel = (bucket: string) =>
  TIME_BUCKETS.find((b) => b.value === bucket)?.label ?? bucket;
