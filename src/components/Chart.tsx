import { csv } from "../../shared/finance";
import { download } from "../lib/auth";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, PieChart, LineChart } from "echarts/charts";
import {
  TooltipComponent,
  LegendComponent,
  GridComponent,
  GraphicComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
echarts.use([
  BarChart,
  PieChart,
  LineChart,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  GraphicComponent,
  CanvasRenderer,
]);
export function Chart({
  option,
  label,
  onSelect,
}: {
  option: EChartsOption;
  label: string;
  onSelect?: (name: string, index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chart = echarts.init(ref.current!);
    chart.setOption(option);
    chart.on("click", (event) =>
      onSelect?.(String(event.name), Number(event.dataIndex)),
    );
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(ref.current!);
    return () => {
      resize.disconnect();
      chart.dispose();
    };
  }, [option, onSelect]);
  const series = (
    Array.isArray(option.series)
      ? option.series
      : option.series
        ? [option.series]
        : []
  ) as { name?: string; data?: unknown[] }[];
  const axis = (
    Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis
  ) as { data?: unknown[] } | undefined;
  const rows = series.flatMap((s, si) =>
    (s.data ?? []).map((item, index) => {
      const point =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as { name?: string; value?: unknown })
          : null;
      return {
        name: point?.name ?? String(axis?.data?.[index] ?? index + 1),
        series: s.name ?? "Value",
        value: point?.value ?? item,
        index,
        key: si + "-" + index,
      };
    }),
  );
  return (
    <>
      <div role="img" aria-label={label} className="chart" ref={ref} />
      <details>
        <summary>View data & export</summary>
        <div className="table-wrap">
          <table>
            <caption>{label}</caption>
            <thead>
              <tr>
                <th>Label</th>
                <th>Series</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    {onSelect ? (
                      <button
                        className="secondary"
                        onClick={() => onSelect(r.name, r.index)}
                      >
                        {r.name}
                      </button>
                    ) : (
                      r.name
                    )}
                  </td>
                  <td>{r.series}</td>
                  <td>{String(r.value ?? "Unavailable")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p>No recorded data for this chart.</p>}
        <button
          className="secondary"
          onClick={() =>
            download(
              csv(
                rows.map(({ name, series, value }) => ({
                  name,
                  series,
                  value,
                })),
              ),
              "koshvista-chart.csv",
              "text/csv",
            )
          }
        >
          Export chart CSV
        </button>
      </details>
    </>
  );
}
