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
}: {
  option: EChartsOption;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chart = echarts.init(ref.current!);
    chart.setOption(option);
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(ref.current!);
    return () => {
      resize.disconnect();
      chart.dispose();
    };
  }, [option]);
  return <div role="img" aria-label={label} className="chart" ref={ref} />;
}
