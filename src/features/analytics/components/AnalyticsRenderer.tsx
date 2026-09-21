import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import type {
  AnalyticsDefinition,
  AnalyticsResult,
} from "../model/analytics.types";
import {
  colorForCategory,
  normalizeAppearance,
} from "../services/analyticsAppearance";

const fmt = (value: unknown) =>
  typeof value === "number"
    ? new Intl.NumberFormat().format(value)
    : String(value ?? "");

type RendererProps = {
  definition: AnalyticsDefinition;
  result: AnalyticsResult;
};

function EChart({ definition, result }: RendererProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const rows = result.rows ?? [];
    const labels = rows.map((row) => String(row.label ?? ""));
    const values = rows.map((row) => Number(row.value ?? 0));
    const type = definition.visualization.type;
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
    let option: EChartsOption;
    if (type === "pie") {
      option = {
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
    } else {
      option = {
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
              ? {
                  lineStyle: {
                    color:
                      appearance.colorMode === "single"
                        ? appearance.singleColor
                        : colors[0],
                  },
                  itemStyle: {
                    color:
                      appearance.colorMode === "single"
                        ? appearance.singleColor
                        : colors[0],
                  },
                }
              : {}),
          },
        ],
      };
    }
    chart.setOption(option);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [definition, result]);
  return <div className="an-echart" ref={ref} />;
}

export function AnalyticsRenderer({ definition, result }: RendererProps) {
  const rows = result.rows ?? [];
  const type = definition.visualization.type;
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
  return <EChart definition={definition} result={result} />;
}
