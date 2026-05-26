"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  LucideIcon,
} from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  format?: "currency" | "number" | "percent" | "duration";
}

export default function StatsCard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  trend = "neutral",
}: StatsCardProps) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : trend === "down"
      ? "text-red-600 dark:text-red-400"
      : "text-zinc-500 dark:text-zinc-400";

  return (
    <Card className="group hover:shadow-md transition-all duration-200">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {title}
            </p>
            <p className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {value}
            </p>
            {change !== undefined && (
              <div className="flex items-center gap-1.5">
                <TrendIcon className={cn("h-4 w-4", trendColor)} />
                <span className={cn("text-sm font-medium", trendColor)}>
                  {change > 0 ? "+" : ""}{change}%
                </span>
                {changeLabel && (
                  <span className="text-sm text-zinc-400">{changeLabel}</span>
                )}
              </div>
            )}
          </div>
          <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/50 p-3 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform duration-200">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
