"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DataPoint {
  name: string;
  value: number;
  previous?: number;
  [key: string]: string | number | undefined;
}

interface AreaChartProps {
  data: DataPoint[];
  dataKeys: { key: string; color: string; name: string }[];
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
}

export default function AreaChartComponent({
  data,
  dataKeys,
  height = 300,
  showGrid = true,
}: AreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgb(228 228 231)"
            className="dark:stroke-zinc-800"
            vertical={false}
          />
        )}
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: "rgb(161 161 170)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "rgb(161 161 170)" }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgb(39 39 42)",
            border: "1px solid rgb(63 63 70)",
            borderRadius: "8px",
            color: "rgb(244 244 245)",
            fontSize: "13px",
          }}
        />
        {dataKeys.map((dk) => (
          <Area
            key={dk.key}
            type="monotone"
            dataKey={dk.key}
            stroke={dk.color}
            fill={dk.color}
            fillOpacity={0.1}
            strokeWidth={2}
            name={dk.name}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
