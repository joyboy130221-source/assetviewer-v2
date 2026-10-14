import { useId, useMemo, type ReactNode } from "react";
import { Unlink } from "lucide-react";
import type { EChartsOption, SeriesOption } from "echarts";
import type {
  AnalyticsAppearance,
  TimeSeriesChartType,
  TimeSeriesConfig,
  TimeSeriesLayout,
  TimeSeriesResult,
} from "../model/analytics.types";
import { presetLabel } from "../model/analyticsCatalog";
import { colorForSeries } from "../services/analyticsAppearance";
import { chartsLinked } from "../services/analyticsMeasureView";
import { formatTimestamp, formatValue } from "../services/analyticsFormat";
import type { ResolvedTheme } from "../services/analyticsTheme";
import { useEChart } from "./useEChart";

type ChartSettings = Pick<TimeSeriesConfig, "showPoints" | "smooth" | "zoom">;

export type TimeSeriesChartProps = {
  series: TimeSeriesResult[];
  /** Position of each measure in the definition (for stable palette colors). */
  colorIndex: Record<string, number>;
  chartType: TimeSeriesChartType;
  layout: TimeSeriesLayout;
  settings: ChartSettings;
  showLegend: boolean;
  appearance?: AnalyticsAppearance;
  theme: ResolvedTheme;
  /** Viewer-chosen chart type per measure id (Separate layout only). */
  measureTypes?: Record<string, TimeSeriesChartType>;
  /** Renders a measure's own toolbar in its chart header (Separate layout). */
  renderMeasureToolbar?: (series: TimeSeriesResult) => ReactNode;
  /** Measures reloading on their own; only their panels show loading. */
  pending?: string[];
};

/**
 * Chart type of one series: the viewer's per-measure choice, else the
 * measure's configured type, else the shared type (shared Table wins).
 */
function typeFor(
  series: TimeSeriesResult,
  chartType: TimeSeriesChartType,
  measureTypes?: Record<string, TimeSeriesChartType>,
) {
  if (chartType === "table") return "table";
  return measureTypes?.[series.id] || series.chartType || chartType;
}

function rangeLabel(s: TimeSeriesResult) {
  const range = s.timeRange;
  if (!range) return "";
  if (range.preset !== "custom" || range.from == null)
    return presetLabel(range.preset);
  return `${formatTimestamp(range.from)} – ${formatTimestamp(range.to ?? range.from)}`;
}

function seriesOption(
  s: TimeSeriesResult,
  type: TimeSeriesChartType,
  color: string,
  settings: ChartSettings,
): SeriesOption {
  const large = s.points.length > 1500;
  const common = {
    name: s.label,
    data: s.points,
    color,
    animation: !large,
  };
  if (type === "bar") return { ...common, type: "bar", barMaxWidth: 18, large };
  if (type === "scatter")
    return { ...common, type: "scatter", symbolSize: 5, large };
  return {
    ...common,
    type: "line",
    step: type === "step" ? "end" : undefined,
    smooth: type === "line" && settings.smooth,
    showSymbol: settings.showPoints && !large,
    symbol: "emptyCircle",
    symbolSize: 5,
    sampling: "lttb",
    lineStyle: { width: 1.6 },
    areaStyle: type === "area" ? { opacity: 0.22 } : undefined,
  };
}

function baseOption(
  series: TimeSeriesResult[],
  settings: ChartSettings,
  showLegend: boolean,
  slider = true,
): EChartsOption {
  const byName = new Map(series.map((s) => [s.label, s]));
  return {
    grid: {
      left: 12,
      right: showLegend ? 150 : 20,
      top: 18,
      bottom: settings.zoom && slider ? 62 : 30,
      containLabel: true,
    },
    legend: showLegend
      ? {
          show: true,
          orient: "vertical",
          right: 8,
          top: "middle",
          icon: "circle",
        }
      : { show: false },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross", label: { show: false } },
      formatter: (raw: unknown) => {
        const items = (Array.isArray(raw) ? raw : [raw]) as {
          seriesName: string;
          marker: string;
          value: [number, number];
        }[];
        if (!items.length) return "";
        const head = `<b>${formatTimestamp(items[0].value[0])}</b>`;
        const lines = items.map((item) => {
          const s = byName.get(item.seriesName);
          return `${item.marker} ${item.seriesName}: <b>${formatValue(
            item.value[1],
            s?.decimals,
            s?.unit,
          )}</b>`;
        });
        return [head, ...lines].join("<br/>");
      },
    },
    xAxis: {
      type: "time",
      name: "Time",
      nameLocation: "end",
      nameGap: 8,
      nameTextStyle: { verticalAlign: "top", padding: [24, 0, 0, 0] },
      splitLine: { show: true },
      axisLabel: {
        hideOverlap: true,
        formatter: "{yyyy}-{MM}-{dd}\n{HH}:{mm}:{ss}",
      },
    },
    yAxis: {
      type: "value",
      scale: true,
      name: series.length === 1 ? series[0].unit : "",
      splitLine: { show: true },
    },
    // Stacked charts share zoom through echarts.connect, so only the last
    // one carries the slider; every chart supports wheel/drag zoom.
    dataZoom: settings.zoom
      ? [
          { type: "inside", filterMode: "none" },
          ...(slider
            ? [
                {
                  type: "slider" as const,
                  height: 18,
                  bottom: 8,
                  filterMode: "none" as const,
                },
              ]
            : []),
        ]
      : [],
  };
}

function Chart({
  option,
  theme,
  group,
  dataKey,
}: {
  option: EChartsOption;
  theme: ResolvedTheme;
  group?: string;
  /** Unchanged data keeps the viewer's zoom when the option is rebuilt. */
  dataKey?: unknown;
}) {
  const ref = useEChart(option, theme, group, dataKey);
  return <div className="an-echart an-ts-echart" ref={ref} />;
}

/**
 * One chart of the Separate layout. Its option is memoized on its own series,
 * so a change to another measure (partial reload, chart type) never redraws
 * this chart.
 */
function SeriesPanel({
  s,
  type,
  color,
  settings,
  showLegend,
  slider,
  linked,
  group,
  theme,
  loading,
  toolbar,
}: {
  s: TimeSeriesResult;
  type: TimeSeriesChartType;
  color: string;
  settings: ChartSettings;
  showLegend: boolean;
  slider: boolean;
  linked: boolean;
  group: string;
  theme: ResolvedTheme;
  loading: boolean;
  toolbar: ReactNode;
}) {
  const option = useMemo<EChartsOption>(
    () => ({
      ...baseOption([s], settings, showLegend, slider),
      series: [seriesOption(s, type, color, settings)],
    }),
    [s, type, color, settings, showLegend, slider],
  );
  return (
    <section
      className={loading ? "an-ts-panel loading" : "an-ts-panel"}
      aria-busy={loading || undefined}
    >
      <header>
        <div className="an-ts-title">
          <h4>{s.label}</h4>
          {!linked && <small className="an-ts-range">{rangeLabel(s)}</small>}
          {loading && <span className="spinner an-ts-spinner" />}
        </div>
        {toolbar}
        {!s.error && <SeriesStats s={s} />}
      </header>
      {s.error ? (
        <div className="an-ts-error" role="alert">
          {s.error.message}
        </div>
      ) : type === "table" ? (
        <TimeSeriesTable series={[s]} />
      ) : (
        <Chart
          option={option}
          theme={theme}
          group={linked ? group : undefined}
          dataKey={s.points}
        />
      )}
    </section>
  );
}

function SeriesStats({ s }: { s: TimeSeriesResult }) {
  if (!s.stats.count)
    return <small className="an-ts-stats">No readings in this range</small>;
  return (
    <small className="an-ts-stats">
      Last <b>{formatValue(s.stats.last, s.decimals, s.unit)}</b> · Min{" "}
      {formatValue(s.stats.min, s.decimals)} · Max{" "}
      {formatValue(s.stats.max, s.decimals)} · Avg{" "}
      {formatValue(s.stats.avg, s.decimals)}
      {s.downsampled &&
        ` · ${s.points.length} of ${s.stats.count} points shown`}
    </small>
  );
}

/** Time + one column per measure, newest first. */
function TimeSeriesTable({ series }: { series: TimeSeriesResult[] }) {
  const rows = useMemo(() => {
    const byTime = new Map<number, Record<string, number>>();
    for (const s of series)
      for (const [t, v] of s.points) {
        if (!byTime.has(t)) byTime.set(t, {});
        byTime.get(t)![s.id] = v;
      }
    return [...byTime.entries()].sort((a, b) => b[0] - a[0]).slice(0, 500);
  }, [series]);
  return (
    <div className="an-table-wrap">
      <table className="an-table">
        <thead>
          <tr>
            <th>Time</th>
            {series.map((s) => (
              <th key={s.id}>{s.unit ? `${s.label} (${s.unit})` : s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([t, values]) => (
            <tr key={t}>
              <td>{formatTimestamp(t)}</td>
              {series.map((s) => (
                <td key={s.id}>{formatValue(values[s.id], s.decimals)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TimeSeriesChart({
  series,
  colorIndex,
  chartType,
  layout,
  settings,
  showLegend,
  appearance,
  theme,
  measureTypes,
  renderMeasureToolbar,
  pending,
}: TimeSeriesChartProps) {
  const group = `an-ts-${useId()}`;
  // Per-measure overrides apply only to the stacked (Separate) layout.
  const separateLayout = layout === "separate" && chartType !== "table";
  const types = separateLayout ? measureTypes : undefined;
  const plotted = useMemo(
    () => (separateLayout ? series : series.filter((s) => !s.error)),
    [series, separateLayout],
  );
  const linked = useMemo(() => chartsLinked(series), [series]);
  // Colors follow each measure's position in the definition, so hiding a
  // measure never recolors the others.
  const colors = useMemo(
    () =>
      series.map((s) =>
        colorForSeries(s.color, colorIndex[s.id] ?? 0, appearance),
      ),
    [series, appearance, colorIndex],
  );

  const colorOf = useMemo(
    () => new Map(series.map((s, i) => [s.id, colors[i]])),
    [series, colors],
  );
  const combined = useMemo<EChartsOption>(
    () => ({
      ...baseOption(plotted, settings, showLegend),
      series: plotted.map((s) =>
        seriesOption(
          s,
          typeFor(s, chartType),
          colorOf.get(s.id) ?? "",
          settings,
        ),
      ),
    }),
    [plotted, settings, showLegend, chartType, colorOf],
  );
  // Linked charts share one slider on the last chart; unlinked charts each
  // zoom on their own and therefore each get a slider.
  const lastChartId = useMemo(() => {
    const charts = plotted.filter(
      (s) => !s.error && typeFor(s, chartType, types) !== "table",
    );
    return charts[charts.length - 1]?.id;
  }, [plotted, chartType, types]);
  const pendingIds = useMemo(() => new Set(pending ?? []), [pending]);

  if (!series.length)
    return (
      <div className="an-empty">
        All measures are hidden. Turn one on in the toolbar.
      </div>
    );
  if (chartType === "table") return <TimeSeriesTable series={plotted} />;
  if (layout === "combined")
    return (
      <div className="an-ts-panel">
        <Chart option={combined} theme={theme} />
      </div>
    );
  return (
    <div className="an-ts-stack">
      {!linked && settings.zoom && (
        <div className="an-ts-unlinked" role="note">
          <Unlink size={13} /> Zoom not linked: charts use different time
          ranges.
        </div>
      )}
      {plotted.map((s) => (
        <SeriesPanel
          key={s.id}
          s={s}
          type={typeFor(s, chartType, types)}
          color={colorOf.get(s.id) ?? ""}
          settings={settings}
          showLegend={showLegend}
          slider={!linked || s.id === lastChartId}
          linked={linked}
          group={group}
          theme={theme}
          loading={pendingIds.has(s.id)}
          toolbar={renderMeasureToolbar?.(s)}
        />
      ))}
    </div>
  );
}
