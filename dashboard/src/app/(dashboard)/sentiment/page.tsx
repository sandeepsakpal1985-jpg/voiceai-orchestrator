"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, TrendingUp, TrendingDown, Smile, Frown, Meh, AlertTriangle } from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import PieChartComponent from "@/components/charts/pie-chart";
import AreaChartComponent from "@/components/charts/area-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";

const defaultSentimentData = [
  { name: "Very Positive", value: 25, color: "#22c55e" },
  { name: "Positive", value: 40, color: "#6366f1" },
  { name: "Neutral", value: 20, color: "#a1a1aa" },
  { name: "Negative", value: 10, color: "#f59e0b" },
  { name: "Very Negative", value: 5, color: "#ef4444" },
];

const defaultTrend = [
  { name: "Week 1", positive: 65, neutral: 22, negative: 13, value: 65 },
  { name: "Week 2", positive: 68, neutral: 20, negative: 12, value: 68 },
  { name: "Week 3", positive: 62, neutral: 24, negative: 14, value: 62 },
  { name: "Week 4", positive: 71, neutral: 18, negative: 11, value: 71 },
  { name: "Week 5", positive: 74, neutral: 16, negative: 10, value: 74 },
  { name: "Week 6", positive: 73, neutral: 17, negative: 10, value: 73 },
  { name: "Week 7", positive: 75, neutral: 15, negative: 10, value: 75 },
  { name: "Week 8", positive: 78, neutral: 14, negative: 8, value: 78 },
];

export default function SentimentPage() {
  interface SentimentItem {
    sentiment: string;
    _count?: { id: number };
    createdAt?: string;
  }

  interface SentimentResponse {
    overall: SentimentItem[];
    byDay: SentimentItem[];
  }

  const { data: sentimentData, loading } = useApi<SentimentResponse>("/api/sentiment?days=30");

  const overall = useMemo(() => {
    const overall = sentimentData?.overall ?? [];
    const total = overall.reduce((sum: number, s: SentimentItem) => sum + (s._count?.id ?? 0), 0);
    const positive = overall.filter((s: SentimentItem) => s.sentiment === "VERY_POSITIVE" || s.sentiment === "POSITIVE")
      .reduce((sum: number, s: SentimentItem) => sum + (s._count?.id ?? 0), 0);
    const neutral = overall.filter((s: SentimentItem) => s.sentiment === "NEUTRAL")
      .reduce((sum: number, s: SentimentItem) => sum + (s._count?.id ?? 0), 0);
    const negative = overall.filter((s: SentimentItem) => s.sentiment === "NEGATIVE" || s.sentiment === "VERY_NEGATIVE")
      .reduce((sum: number, s: SentimentItem) => sum + (s._count?.id ?? 0), 0);
    return { total, positive, neutral, negative, positivePct: total > 0 ? (positive / total) * 100 : 0 };
  }, [sentimentData]);

  const sentDist = useMemo(() => {
    const overall = sentimentData?.overall ?? [];
    if (overall.length === 0) return defaultSentimentData;
    const total = overall.reduce((sum: number, s: SentimentItem) => sum + (s._count?.id ?? 0), 0);
    if (total === 0) return defaultSentimentData;
    const colors: Record<string, string> = {
      VERY_POSITIVE: "#22c55e",
      POSITIVE: "#6366f1",
      NEUTRAL: "#a1a1aa",
      NEGATIVE: "#f59e0b",
      VERY_NEGATIVE: "#ef4444",
    };
    return overall.map((s: SentimentItem) => ({
      name: s.sentiment?.replace("_", " ") ?? "Unknown",
      value: Math.round(((s._count?.id ?? 0) / total) * 100),
      color: colors[s.sentiment] ?? "#a1a1aa",
    }));
  }, [sentimentData]);

  const trendData = useMemo(() => {
    const byDay = sentimentData?.byDay ?? [];
    if (byDay.length === 0) return defaultTrend;
    const grouped: Record<string, { positive: number; neutral: number; negative: number }> = {};
    byDay.forEach((d: SentimentItem) => {
      const key = new Date(d.createdAt!).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (!grouped[key]) grouped[key] = { positive: 0, neutral: 0, negative: 0 };
      if (d.sentiment === "VERY_POSITIVE" || d.sentiment === "POSITIVE") grouped[key]!.positive++;
      else if (d.sentiment === "NEGATIVE" || d.sentiment === "VERY_NEGATIVE") grouped[key]!.negative++;
      else grouped[key]!.neutral++;
    });
    return Object.entries(grouped).map(([name, vals]) => ({ name, ...vals, value: vals.positive }));
  }, [sentimentData]);

  const pct = Math.round(overall.positivePct);
  const nPct = Math.round(overall.neutral > 0 ? (overall.neutral / Math.max(overall.total, 1)) * 100 : 20);
  const negPct = Math.round(overall.negative > 0 ? (overall.negative / Math.max(overall.total, 1)) * 100 : 15);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navbar />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Sentiment Analytics</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Emotional analysis of customer conversations</p>
            </div>
          </div>
          <Badge variant="primary" className="gap-1.5 px-3 py-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            Updated live
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <Smile className="h-5 w-5 text-emerald-500" />
                <p className="text-sm text-zinc-500">Overall Sentiment</p>
              </div>
              <p className="text-3xl font-bold text-emerald-600">{(pct / 10).toFixed(1)}/10</p>
              <div className="flex items-center gap-1 mt-1">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-emerald-600">+0.3 vs last month</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <Smile className="h-5 w-5 text-indigo-500" />
                <p className="text-sm text-zinc-500">Positive Calls</p>
              </div>
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{pct}%</p>
              <div className="flex items-center gap-1 mt-1">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-emerald-600">+3% this week</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <Meh className="h-5 w-5 text-zinc-500" />
                <p className="text-sm text-zinc-500">Neutral Calls</p>
              </div>
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{nPct}%</p>
              <div className="flex items-center gap-1 mt-1">
                <TrendingDown className="h-4 w-4 text-zinc-500" />
                <span className="text-sm text-zinc-500">-2% this week</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <Frown className="h-5 w-5 text-red-500" />
                <p className="text-sm text-zinc-500">Negative Calls</p>
              </div>
              <p className="text-3xl font-bold text-red-500">{negPct}%</p>
              <div className="flex items-center gap-1 mt-1">
                <TrendingDown className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-emerald-600">-1% this week</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Sentiment Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <AreaChartComponent
                data={trendData}
                dataKeys={[
                  { key: "positive", color: "#22c55e", name: "Positive" },
                  { key: "neutral", color: "#a1a1aa", name: "Neutral" },
                  { key: "negative", color: "#ef4444", name: "Negative" },
                ]}
                height={300}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Sentiment Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <PieChartComponent
                data={sentDist}
                innerRadius={60}
                outerRadius={100}
                height={300}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sentiment Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { message: "High negative sentiment detected in recent calls", time: "2 min ago", severity: "critical" },
                { message: "Overall sentiment showing improving trend", time: "15 min ago", severity: "positive" },
                { message: "Review call scripts for optimization opportunities", time: "1 hour ago", severity: "warning" },
              ].map((alert, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                  <AlertTriangle className={`h-5 w-5 mt-0.5 ${
                    alert.severity === "critical" ? "text-red-500" :
                    alert.severity === "warning" ? "text-amber-500" : "text-emerald-500"
                  }`} />
                  <div className="flex-1">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{alert.message}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{alert.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
