import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AnalyticsDefinition,
  AnalyticsResult,
  AnalyticsRuntimeInput,
  TimeSeriesResult,
} from "../model/analytics.types";
import { presetLabel, withDefaults } from "../model/analyticsCatalog";
import { formatTimestamp } from "../services/analyticsFormat";
import type { ResolvedTheme } from "../services/analyticsTheme";
import {
  activeMeasureOverrides,
  effectiveLayout,
  hasMeasureToolbar,
  isTimeSeriesChartType,
  measureChartTypes,
} from "../services/analyticsMeasureView";
import {
  defaultViewState,
  readViewState,
  runtimeKey,
  toRuntimeInput,
  writeViewState,
  type AnalyticsViewState,
  type MeasureViewState,
} from "../services/analyticsViewState";
import {
  changedMeasures,
  failSeries,
  mergeSeries,
} from "../services/analyticsPartialReload";
import { AnalyticsRenderer } from "./AnalyticsRenderer";
import { AnalyticsToolbar } from "./AnalyticsToolbar";
import { MeasureToolbar } from "./MeasureToolbar";

type Props = {
  definition: AnalyticsDefinition;
  /** Runs the definition with validated viewer input (admin or public API). */
  execute: (input: AnalyticsRuntimeInput) => Promise<AnalyticsResult>;
  theme: ResolvedTheme;
  /** Load on mount (published page) or only when reloadToken changes (builder). */
  autoLoad?: boolean;
  /** Increment to force a reload, e.g. the builder's Test & Preview button. */
  reloadToken?: number;
  /** Keep the view in the page URL so it can be shared or bookmarked. */
  syncUrl?: boolean;
  onResult?: (result: AnalyticsResult) => void;
  onError?: (error: Error) => void;
  emptyState?: ReactNode;
};

function RangeSummary({ result }: { result: AnalyticsResult }) {
  const range = result.timeRange;
  if (!range) return null;
  if (range.from == null) return <span>{presetLabel(range.preset)}</span>;
  return (
    <span>
      {formatTimestamp(range.from)} – {formatTimestamp(range.to ?? range.from)}
    </span>
  );
}

export function AnalyticsViewer({
  definition,
  execute,
  theme,
  autoLoad = true,
  reloadToken = 0,
  syncUrl = false,
  onResult,
  onError,
  emptyState,
}: Props) {
  const d = useMemo(() => withDefaults(definition), [definition]);
  const defaults = useMemo(() => defaultViewState(d), [d]);
  const [state, setState] = useState<AnalyticsViewState>(() =>
    syncUrl
      ? readViewState(d, new URLSearchParams(window.location.search))
      : defaults,
  );
  const [result, setResult] = useState<AnalyticsResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Latest callbacks without re-triggering loads when the parent re-renders.
  const executeRef = useRef(execute);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  executeRef.current = execute;
  // Read the definition through a ref so editing it in the builder never
  // triggers a fetch by itself (only Test & Preview or toolbar changes do).
  const definitionRef = useRef(d);
  definitionRef.current = d;
  onResultRef.current = onResult;
  onErrorRef.current = onError;
  const requestId = useRef(0);
  const loaded = useRef(false);
  const busyRef = useRef(false);
  /** Input of the latest request, the baseline for detecting partial changes. */
  const lastInput = useRef<AnalyticsRuntimeInput | null>(null);
  /** Latest partial request per measure; older responses are ignored. */
  const measureRequest = useRef<Record<string, number>>({});
  const measureCounter = useRef(0);
  /** Measures currently reloading on their own (only their charts dim). */
  const [pending, setPending] = useState<string[]>([]);

  // Full load: shared controls changed, Refresh, or first load.
  const load = useCallback(
    async (view: AnalyticsViewState, { fresh = false } = {}) => {
      const id = ++requestId.current;
      busyRef.current = true;
      setBusy(true);
      setPending([]); // a full load supersedes every partial one
      setError("");
      const input = toRuntimeInput(view, definitionRef.current);
      lastInput.current = input;
      try {
        const r = await executeRef.current(fresh ? { ...input, fresh } : input);
        if (id !== requestId.current) return; // a newer request superseded this one
        loaded.current = true;
        setResult(r);
        onResultRef.current?.(r);
      } catch (e) {
        if (id !== requestId.current) return;
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err.message);
        onErrorRef.current?.(err);
      } finally {
        if (id === requestId.current) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    },
    [],
  );

  // Partial load: only these measures' own toolbar values changed.
  const loadMeasures = useCallback(
    async (ids: string[], view: AnalyticsViewState) => {
      const generation = requestId.current;
      const tokens = Object.fromEntries(
        ids.map((id) => [
          id,
          (measureRequest.current[id] = ++measureCounter.current),
        ]),
      );
      setPending((current) => [...new Set([...current, ...ids])]);
      const input = toRuntimeInput(view, definitionRef.current);
      lastInput.current = input;
      // Still current: no full load since, and no newer request for the measure.
      const current = () =>
        ids.filter(
          (id) =>
            generation === requestId.current &&
            measureRequest.current[id] === tokens[id],
        );
      try {
        const r = await executeRef.current({ ...input, only: ids });
        const accepted = current();
        if (accepted.length)
          setResult((prev) =>
            prev ? mergeSeries(prev, r.series ?? [], accepted) : prev,
          );
      } catch (e) {
        const accepted = current();
        const message = e instanceof Error ? e.message : String(e);
        if (accepted.length)
          setResult((prev) =>
            prev ? failSeries(prev, accepted, message) : prev,
          );
      } finally {
        const done = new Set(current());
        if (done.size) setPending((list) => list.filter((id) => !done.has(id)));
      }
    },
    [],
  );

  const key = runtimeKey(state, d);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Initial load (published page) and explicit reloads (builder).
  useEffect(() => {
    if (autoLoad || reloadToken > 0) void load(stateRef.current);
  }, [autoLoad, reloadToken, load]);

  // Server-affecting toolbar changes refetch once data has been shown. A
  // change limited to measures' own toolbars reloads only those measures.
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    if (!loaded.current) return;
    const view = stateRef.current;
    const next = toRuntimeInput(view, definitionRef.current);
    const ids =
      !busyRef.current &&
      lastInput.current &&
      definitionRef.current.mode === "timeseries"
        ? changedMeasures(lastInput.current, next)
        : null;
    if (!ids) return void load(view);
    // Hidden measures are fetched again when they are shown.
    const visible = ids.filter((id) => !view.hidden.includes(id));
    if (visible.length) void loadMeasures(visible, view);
    else lastInput.current = next;
  }, [key, load, loadMeasures]);

  useEffect(() => {
    if (!syncUrl) return;
    const next = writeViewState(
      state,
      defaults,
      new URLSearchParams(window.location.search),
    );
    const query = next.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
  }, [state, defaults, syncUrl]);

  const overrides = useMemo(() => activeMeasureOverrides(d, state), [d, state]);
  const measureTypes = useMemo(() => measureChartTypes(overrides), [overrides]);
  const layout = effectiveLayout(d, state);
  const sharedChartType = isTimeSeriesChartType(state.chartType)
    ? state.chartType
    : d.timeSeries.chartType;
  const measuresById = useMemo(
    () => new Map(d.timeSeries.measures.map((m) => [m.id, m])),
    [d],
  );
  const setMeasure = useCallback(
    (id: string, next: MeasureViewState) =>
      setState((current) => {
        const measures = { ...current.measures };
        if (Object.keys(next).length) measures[id] = next;
        else delete measures[id];
        return { ...current, measures };
      }),
    [],
  );
  const renderMeasureToolbar = (s: TimeSeriesResult) => {
    const measure = measuresById.get(s.id);
    if (!measure || !hasMeasureToolbar(d, measure, layout)) return null;
    return (
      <MeasureToolbar
        definition={d}
        measure={measure}
        state={state}
        sharedChartType={sharedChartType}
        onChange={(next) => setMeasure(s.id, next)}
      />
    );
  };

  return (
    <div className={`an-viewer an-theme-${theme}`}>
      <AnalyticsToolbar
        definition={d}
        state={state}
        defaults={defaults}
        result={result}
        busy={busy}
        onChange={setState}
        // Refresh always asks the source again, bypassing any server cache.
        onRefresh={() => void load(state, { fresh: true })}
      />
      {error && (
        <div className="an-viewer-error" role="alert">
          {error}
        </div>
      )}
      {result ? (
        <>
          <div className="an-viewer-meta">
            <RangeSummary result={result} />
            <span>
              {result.filteredCount} of {result.rawCount} records
            </span>
            {!!result.unparsedTimeCount && (
              <span>{result.unparsedTimeCount} without a valid time</span>
            )}
          </div>
          <div className={busy ? "an-viewer-body loading" : "an-viewer-body"}>
            <AnalyticsRenderer
              definition={d}
              result={result}
              theme={theme}
              view={{
                chartType: state.chartType,
                layout: state.layout,
                hidden: state.hidden,
                measureTypes,
                pending,
              }}
              renderMeasureToolbar={renderMeasureToolbar}
            />
          </div>
        </>
      ) : busy ? (
        <div className="an-empty">
          <span className="spinner" /> Loading analytics…
        </div>
      ) : (
        (emptyState ?? null)
      )}
    </div>
  );
}
