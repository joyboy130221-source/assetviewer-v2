import { useEffect, useRef, type RefObject } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import type { ResolvedTheme } from "../services/analyticsTheme";

/**
 * Single ECharts lifecycle for every analytics visualization: init per theme,
 * option updates without re-init, responsive resize, and optional grouping so
 * stacked charts share crosshair and zoom (echarts.connect).
 */
type ZoomWindow = { start: number; end: number };

/** Current zoom window (percent) of the first dataZoom, if any. */
function zoomWindow(chart: echarts.ECharts): ZoomWindow | null {
  const zoom = (chart.getOption() as { dataZoom?: Partial<ZoomWindow>[] })
    ?.dataZoom?.[0];
  if (!zoom || zoom.start == null || zoom.end == null) return null;
  return zoom.start === 0 && zoom.end === 100
    ? null
    : { start: zoom.start, end: zoom.end };
}

/**
 * @param dataKey when given and unchanged since the last update, the viewer's
 *   zoom is kept although the option was rebuilt (e.g. the zoom slider was
 *   added because charts were unlinked). New data resets the zoom as before.
 */
export function useEChart(
  option: EChartsOption,
  theme: ResolvedTheme,
  group?: string,
  dataKey?: unknown,
): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const lastDataKey = useRef<unknown>(undefined);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(
      ref.current,
      theme === "dark" ? "dark" : undefined,
    );
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const keep =
      dataKey !== undefined && dataKey === lastDataKey.current
        ? zoomWindow(chart)
        : null;
    lastDataKey.current = dataKey;
    chart.setOption({ backgroundColor: "transparent", ...option }, true);
    if (keep) chart.dispatchAction({ type: "dataZoom", ...keep });
    if (group) {
      chart.group = group;
      echarts.connect(group);
    } else {
      // Leaving a group (e.g. ranges diverged) must stop the shared zoom.
      chart.group = "";
    }
  }, [option, theme, group, dataKey]);

  return ref;
}
