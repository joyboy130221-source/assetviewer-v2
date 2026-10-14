import { useMemo, type ReactNode } from "react";
import type { EChartsOption } from "echarts";
import type {
  AnalyticsDefinition,
  AnalyticsResult,
  TimeSeriesChartType,
  TimeSeriesLayout,
  TimeSeriesResult,
  VisualizationType,
} from "../model/analytics.types";
import {
  TIMESERIES_CHART_TYPES,
  AGGREGATE_CHART_TYPES,
  withDefaults,
} from "../model/analyticsCatalog";
import {
  colorForCategory,
  normalizeAppearance,
} from "../services/analyticsAppearance";
import type { ResolvedTheme } from "../services/analyticsTheme";
import { TimeSeriesChart } from "./TimeSeriesChart";
import { useEChart } from "./useEChart";

const fmt = (value: unknown) =>
  typeof value === "number"
    ? new Intl.NumberFormat().format(value)
    : String(value ?? "");

/** Presentation overrides chosen in the viewer toolbar. */
export type AnalyticsRenderView = {
  chartType?: string;
  layout?: TimeSeriesLayout | "";
  hidden?: string[];
  /** Per-measure chart types chosen on measure toolbars. */
  measureTypes?: Record<string, TimeSeriesChartType>;
  /** Measures reloading on their own; only their charts show loading. */
  pending?: string[];
};

type RendererProps = {
  definition: AnalyticsDefinition;
  result: AnalyticsResult;
  view?: AnalyticsRenderView;
  theme?: ResolvedTheme;
  /** Renders a measure's own toolbar (time series, Separate layout). */
  renderMeasureToolbar?: (series: TimeSeriesResult) => ReactNode;
};

function aggregateOption(
  definition: AnalyticsDefinition,
  result: AnalyticsResult,
  type: VisualizationType,
): EChartsOption {
  const rows = result.rows ?? [];
  const labels = rows.map((row) => String(row.label ?? ""));
  const values = rows.map((row) => Number(row.value ?? 0));
  const appearance = normalizeAppearance(definition.visualization.appearance);
  const colors = labels.map((label, index) =>
    colorForCategory(label, index, appearance),
  );
  const common: EChartsOption = {
    animationDuration: 350,
    color: colors,
    tooltip: { trigger: type === "pie" ? "item" : "axis" },
    title: { show: false },
  };
  if (type === "pie")
    return {
      ...common,
      legend: {
        show: definition.visualization.showLegend,
        orient: "vertical",
        right: 8,
        top: "middle",
      },
      series: [
        {
          type: "pie",
          radius: ["45%", "72%"],
          center: ["38%", "50%"],
          label: { show: definition.visualization.showLabels },
          data: rows.map((row, index) => ({
            name: labels[index],
            value: Number(row.value ?? 0),
            itemStyle: { color: colors[index] },
          })),
        },
      ],
    };
  const lineColor =
    appearance.colorMode === "single" ? appearance.singleColor : colors[0];
  return {
    ...common,
    grid: { left: 45, right: 24, top: 20, bottom: 55, containLabel: true },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { interval: 0, rotate: labels.length > 8 ? 30 : 0 },
    },
    yAxis: { type: "value" },
    series: [
      {
        type: type === "line" ? "line" : "bar",
        data: values.map((value, index) =>
          type === "bar"
            ? {
                value,
                itemStyle: {
                  color: colors[index],
                  borderRadius: [4, 4, 0, 0],
                },
              }
            : value,
        ),
        smooth: type === "line",
        label: {
          show: definition.visualization.showLabels,
          position: "top",
        },
        ...(type === "line"
          ? { lineStyle: { color: lineColor }, itemStyle: { color: lineColor } }
          : {}),
      },
    ],
  };
}

function AggregateChart({
  definition,
  result,
  type,
  theme,
}: Omit<RendererProps, "view" | "theme" | "renderMeasureToolbar"> & {
  type: VisualizationType;
  theme: ResolvedTheme;
}) {
  const option = useMemo(
    () => aggregateOption(definition, result, type),
    [definition, result, type],
  );
  const ref = useEChart(option, theme);
  return <div className="an-echart" ref={ref} />;
}

function AggregateRenderer({
  definition,
  result,
  type,
  theme,
}: Omit<RendererProps, "view" | "theme" | "renderMeasureToolbar"> & {
  type: VisualizationType;
  theme: ResolvedTheme;
}) {
  const rows = result.rows ?? [];
  if (type === "kpi")
    return (
      <div className="an-kpi">
        <span>{definition.visualization.title || definition.name}</span>
        <strong>{fmt(rows[0]?.value ?? 0)}</strong>
        <small>
          {definition.aggregation.toUpperCase()}{" "}
          {definition.measure || "records"}
        </small>
      </div>
    );
  if (type === "table") {
    const keys = rows.length ? Object.keys(rows[0]) : [];
    return (
      <div className="an-table-wrap">
        <table className="an-table">
          <thead>
            <tr>
              {keys.map((key) => (
                <th key={key}>{key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((row, index) => (
              <tr key={index}>
                {keys.map((key) => (
                  <td key={key}>{fmt(row[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (!rows.length)
    return (
      <div className="an-empty">No data available for this visualization.</div>
    );
  return (
    <AggregateChart
      definition={definition}
      result={result}
      type={type}
      theme={theme}
    />
  );
}

export function AnalyticsRenderer({
  definition,
  result,
  view = {},
  theme = "light",
  renderMeasureToolbar,
}: RendererProps) {
  // Stable references keep ECharts from redrawing (and losing zoom) on
  // unrelated re-renders.
  const d = useMemo(() => withDefaults(definition), [definition]);
  const hiddenKey = (view.hidden ?? []).join(",");
  const visibleSeries = useMemo(() => {
    const hidden = new Set(hiddenKey.split(",").filter(Boolean));
    return (result.series ?? []).filter((s) => !hidden.has(s.id));
  }, [result.series, hiddenKey]);

  const colorIndex = useMemo(
    () => Object.fromEntries((result.series ?? []).map((s, i) => [s.id, i])),
    [result.series],
  );

  if (d.mode === "timeseries") {
    const chartType = (
      TIMESERIES_CHART_TYPES.some((t) => t.value === view.chartType)
        ? view.chartType
        : d.timeSeries.chartType
    ) as TimeSeriesChartType;
    if (!result.series)
      return (
        <div className="an-empty">
          Run Test & Preview to load the time series.
        </div>
      );
    return (
      <TimeSeriesChart
        series={visibleSeries}
        colorIndex={colorIndex}
        chartType={chartType}
        layout={view.layout || d.timeSeries.layout}
        settings={d.timeSeries}
        showLegend={d.visualization.showLegend}
        appearance={d.visualization.appearance}
        theme={theme}
        measureTypes={view.measureTypes}
        pending={view.pending}
        renderMeasureToolbar={renderMeasureToolbar}
      />
    );
  }
  const type = (
    AGGREGATE_CHART_TYPES.some((t) => t.value === view.chartType)
      ? view.chartType
      : d.visualization.type
  ) as VisualizationType;
  return (
    <AggregateRenderer
      definition={d}
      result={result}
      type={type}
      theme={theme}
    />
  );
}
