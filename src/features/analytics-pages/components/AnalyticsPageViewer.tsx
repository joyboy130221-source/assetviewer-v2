import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type {
  AnalyticsResult,
  AnalyticsRuntimeInput,
} from "../../analytics/model/analytics.types";
import { AnalyticsViewer } from "../../analytics/components/AnalyticsViewer";
import type { ResolvedTheme } from "../../analytics/services/analyticsTheme";
import type { PageTarget, SelectorView } from "../model/analyticsPage.types";
import { ItemSelect } from "./ItemSelect";

type Props = {
  selector: SelectorView;
  /** Which chart an item opens ("" = the page's default item). */
  resolve: (item: string) => Promise<PageTarget>;
  /** Runs the chart of an item with the viewer's controls. */
  execute: (
    item: string,
    input: AnalyticsRuntimeInput,
  ) => Promise<AnalyticsResult>;
  theme: ResolvedTheme;
  /** Item to open first (e.g. from the link); invalid values fall back. */
  initialItem?: string;
  /** Selection changed (the page keeps it in the URL if configured). */
  onItemChange?: (item: string) => void;
  /** Reload the item list after the item API failed. */
  onRetryItems?: () => void;
  /** Keep chart controls in the URL (published pages). */
  syncUrl?: boolean;
  /** Increment to reload the current chart (builder preview). */
  reloadToken?: number;
};

type ChartState =
  | { status: "loading" }
  | {
      status: "ready";
      target: PageTarget & { chart: NonNullable<PageTarget["chart"]> };
    }
  | { status: "empty"; message: string }
  | { status: "error"; message: string };

/**
 * An Analytics Page at runtime: the optional item dropdown and the chart of
 * the selected item. Data access is injected (resolve / execute), so the
 * builder preview and published pages share this component.
 */
export function AnalyticsPageViewer({
  selector,
  resolve,
  execute,
  theme,
  initialItem = "",
  onItemChange,
  onRetryItems,
  syncUrl = false,
  reloadToken = 0,
}: Props) {
  const [item, setItem] = useState(initialItem);
  const [state, setState] = useState<ChartState>({ status: "loading" });
  const request = useRef(0);

  const open = useCallback(
    async (requested: string) => {
      const id = ++request.current;
      setState({ status: "loading" });
      try {
        const target = await resolve(requested);
        if (id !== request.current) return; // a newer selection won
        if (target.item) setItem(target.item.value);
        setState(
          target.chart
            ? { status: "ready", target: { ...target, chart: target.chart } }
            : {
                status: "empty",
                message: target.message || "Nothing to show for this item.",
              },
        );
      } catch (e) {
        if (id !== request.current) return;
        setState({
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [resolve],
  );

  useEffect(() => {
    void open(initialItem);
    // Re-resolve when the page definition (resolve) or reload token changes.
  }, [open, initialItem, reloadToken]);

  const select = (value: string) => {
    setItem(value);
    onItemChange?.(value);
    void open(value);
  };

  const runChart = useCallback(
    (input: AnalyticsRuntimeInput) => execute(item, input),
    [execute, item],
  );

  return (
    <div className="ap-viewer">
      {selector.enabled && (
        <div className="ap-selector-bar">
          {selector.error ? (
            <div className="ap-selector-error" role="alert">
              <span>{selector.error.error}</span>
              {onRetryItems && (
                <button className="secondary-button" onClick={onRetryItems}>
                  <RefreshCw size={14} /> Retry
                </button>
              )}
            </div>
          ) : (
            <ItemSelect
              label={selector.label}
              items={selector.items}
              value={item}
              onChange={select}
              searchThreshold={selector.searchThreshold}
              disabled={state.status === "loading"}
            />
          )}
          {selector.truncated && (
            <small className="an-hint">
              Only the first {selector.items.length} items are shown.
            </small>
          )}
        </div>
      )}

      {state.status === "loading" && (
        <div className="state-card">
          <span className="spinner" /> Loading chart…
        </div>
      )}
      {(state.status === "empty" || state.status === "error") && (
        <div
          className={
            state.status === "error" ? "state-card error" : "state-card"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </div>
      )}
      {state.status === "ready" && (
        <section className="ap-chart">
          {state.target.chart.visualization.title && (
            <h2>{state.target.chart.visualization.title}</h2>
          )}
          <AnalyticsViewer
            // A new item or chart starts with a fresh viewer state.
            key={`${state.target.item?.value ?? ""}:${state.target.chart.id}`}
            definition={state.target.chart}
            execute={runChart}
            theme={theme}
            autoLoad
            reloadToken={reloadToken}
            syncUrl={syncUrl}
          />
        </section>
      )}
    </div>
  );
}
