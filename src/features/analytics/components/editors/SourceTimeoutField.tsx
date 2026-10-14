import { useEffect, useState } from "react";
import type {
  AnalyticsBuilderLimits,
  AnalyticsResult,
} from "../../model/analytics.types";

type Props = {
  /** Stored value in milliseconds; undefined means the server default. */
  value: number | undefined;
  onChange: (timeoutMs: number | undefined) => void;
  /** Server bounds; null while loading or when unavailable. */
  limits: AnalyticsBuilderLimits["sourceTimeoutMs"] | null;
  /** Last Test & Preview metrics, used to warn when the source is close to the limit. */
  lastRun?: AnalyticsResult["source"];
};

/** Shown with one decimal only when needed: 15 → "15", 2.34 → "2.3". */
const seconds = (ms: number) => String(Math.round(ms / 100) / 10);
/** A source that used this share of its timeout gets a warning. */
const NEAR_LIMIT_RATIO = 0.8;

/**
 * Source API timeout, edited in seconds and stored in milliseconds.
 * Leaving it blank keeps the server default, so the definition follows any
 * later change to ANALYTICS_DEFAULT_SOURCE_TIMEOUT_MS.
 */
export function SourceTimeoutField({
  value,
  onChange,
  limits,
  lastRun,
}: Props) {
  const [text, setText] = useState(value ? seconds(value) : "");

  // Follow external changes (loading a saved definition).
  useEffect(() => {
    const current = text.trim() ? Math.round(Number(text) * 1000) : undefined;
    if (current !== value) setText(value ? seconds(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const change = (next: string) => {
    setText(next);
    if (!next.trim()) return onChange(undefined);
    const parsed = Number(next);
    if (Number.isFinite(parsed) && parsed > 0)
      onChange(Math.round(parsed * 1000));
  };

  const parsed = text.trim() ? Number(text) * 1000 : undefined;
  const outOfRange =
    limits && parsed !== undefined && Number.isFinite(parsed)
      ? parsed > limits.max
        ? `The server limit is ${seconds(limits.max)} s; ${seconds(limits.max)} s will be used.`
        : parsed < limits.min
          ? `The minimum is ${seconds(limits.min)} s; ${seconds(limits.min)} s will be used.`
          : ""
      : "";
  const invalid =
    text.trim() && !(Number.isFinite(Number(text)) && Number(text) > 0);
  const nearLimit =
    lastRun && lastRun.durationMs >= lastRun.timeoutMs * NEAR_LIMIT_RATIO;

  return (
    <label>
      Timeout (seconds)
      <input
        type="number"
        inputMode="decimal"
        min={limits ? limits.min / 1000 : 1}
        max={limits ? limits.max / 1000 : undefined}
        step={1}
        placeholder={
          limits ? `Default: ${seconds(limits.default)}` : "Server default"
        }
        value={text}
        onChange={(e) => change(e.target.value)}
        aria-invalid={invalid || undefined}
      />
      <small>
        How long Integration Hub waits for the source API before failing.
        {limits
          ? ` Leave blank for the server default (${seconds(limits.default)} s). Maximum ${seconds(limits.max)} s.`
          : " Leave blank for the server default."}
      </small>
      {invalid && <small className="an-hint">Enter a number of seconds.</small>}
      {outOfRange && <small className="an-hint">{outOfRange}</small>}
      {lastRun && (
        <small className="an-hint">
          Last Test &amp; Preview: the source responded in{" "}
          {seconds(lastRun.durationMs)} s (limit {seconds(lastRun.timeoutMs)} s)
          {nearLimit
            ? ". This is close to the limit; consider a longer timeout or a narrower query."
            : "."}
        </small>
      )}
    </label>
  );
}
