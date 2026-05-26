"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface BarChartProps {
  data: { name: string; value: number; [key: string]: string | number | undefined }[];
  dataKey?: string;
  color?: string;
  height?: number;
  horizontal?: boolean;
}

export default function BarChartComponent({
  data,
  dataKey = "value",
  color = "#6366f1",
  height = 300,
  horizontal = false,
}: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgb(228 228 231)"
          className="dark:stroke-zinc-800"
          vertical={false}
        />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 12, fill: "rgb(161 161 170)" }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "rgb(161 161 170)" }} tickLine={false} axisLine={false} width={100} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "rgb(161 161 170)" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "rgb(161 161 170)" }} tickLine={false} axisLine={false} width={40} />
          </>
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: "rgb(39 39 42)",
            border: "1px solid rgb(63 63 70)",
            borderRadius: "8px",
            color: "rgb(244 244 245)",
            fontSize: "13px",
          }}
        />
        <Bar
          dataKey={dataKey}
          fill={color}
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
