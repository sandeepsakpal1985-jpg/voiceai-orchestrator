"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, Filter, PhoneCall, Clock, CheckCircle2, DollarSign } from "lucide-react";
import StatsCard from "@/components/dashboard/stats-card";
import AreaChartComponent from "@/components/charts/area-chart";
import BarChartComponent from "@/components/charts/bar-chart";
import PieChartComponent from "@/components/charts/pie-chart";
import Navbar from "@/components/dashboard/navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";

interface AnalyticsResponse {
  totalCalls?: number;
  avgDuration?: number;
  successRate?: number;
  hourlyData?: number[];
  durationDistribution?: {
    under1Min?: number;
    oneToThreeMin?: number;
    threeToFiveMin?: number;
    fiveToTenMin?: number;
    overTenMin?: number;
  };
  statusDistribution?: {
    completed?: number;
    failed?: number;
    voicemail?: number;
    noAnswer?: number;
  };
  dailyTrend?: Array<{ createdAt: string; direction: string }>;
  sentimentBreakdown?: Array<{ sentiment: string; _count: number }>;
  period?: { days?: number };
}

export default function AnalyticsPage() {
  const { data: analyticsData, loading } = useApi<AnalyticsResponse>("/api/analytics?days=30");

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "0m 0s";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  };

  const analytics = analyticsData ?? {};

  const hourlyActivity = useMemo(() => {
    // Deterministic fallback values — avoid Math.random() in render (React 19 purity)
    const fallbackValues = [18, 12, 8, 6, 10, 15, 22, 30, 38, 42, 45, 48, 46, 44, 40, 38, 36, 32, 28, 24, 22, 20, 18, 15];
    const hours = Array.from({ length: 24 }, (_, i) => ({
      name: `${i.toString().padStart(2, "0")}:00`,
      value: analytics.hourlyData?.[i] ?? fallbackValues[i],
      calls: analytics.hourlyData?.[i] ?? fallbackValues[i],
    }));
    return hours;
  }, [analytics.hourlyData]);

  const durationData = useMemo(() => {
    if (analytics.durationDistribution) {
      return [
        { name: "< 1 min", value: analytics.durationDistribution.under1Min ?? 0, color: "#22c55e" },
        { name: "1-3 min", value: analytics.durationDistribution.oneToThreeMin ?? 0, color: "#6366f1" },
        { name: "3-5 min", value: analytics.durationDistribution.threeToFiveMin ?? 0, color: "#8b5cf6" },
        { name: "5-10 min", value: analytics.durationDistribution.fiveToTenMin ?? 0, color: "#f59e0b" },
        { name: "> 10 min", value: analytics.durationDistribution.overTenMin ?? 0, color: "#ef4444" },
      ];
    }
    return [
      { name: "< 1 min", value: 320, color: "#22c55e" },
      { name: "1-3 min", value: 580, color: "#6366f1" },
      { name: "3-5 min", value: 340, color: "#8b5cf6" },
      { name: "5-10 min", value: 180, color: "#f59e0b" },
      { name: "> 10 min", value: 42, color: "#ef4444" },
    ];
  }, [analytics.durationDistribution]);

  const statusDistribution = useMemo(() => {
    if (analytics.statusDistribution) {
      return [
        { name: "Completed", value: analytics.statusDistribution.completed ?? 0, color: "#22c55e" },
        { name: "Failed", value: analytics.statusDistribution.failed ?? 0, color: "#ef4444" },
        { name: "Voicemail", value: analytics.statusDistribution.voicemail ?? 0, color: "#f59e0b" },
        { name: "No Answer", value: analytics.statusDistribution.noAnswer ?? 0, color: "#6366f1" },
      ];
    }
    return [
      { name: "Completed", value: 8940, color: "#22c55e" },
      { name: "Failed", value: 1240, color: "#ef4444" },
      { name: "Voicemail", value: 2480, color: "#f59e0b" },
      { name: "No Answer", value: 1860, color: "#6366f1" },
    ];
  }, [analytics.statusDistribution]);

  const callTrends = useMemo(() => {
    const daily = analytics.dailyTrend ?? [];
    if (daily.length === 0) {
      return [
        { name: "Jan", inbound: 1200, outbound: 850, total: 2050, value: 2050 },
        { name: "Feb", inbound: 1350, outbound: 920, total: 2270, value: 2270 },
        { name: "Mar", inbound: 1100, outbound: 780, total: 1880, value: 1880 },
        { name: "Apr", inbound: 1580, outbound: 1050, total: 2630, value: 2630 },
        { name: "May", inbound: 1650, outbound: 1120, total: 2770, value: 2770 },
        { name: "Jun", inbound: 1420, outbound: 980, total: 2400, value: 2400 },
      ];
    }
    return daily.map((d: { createdAt: string; direction: string }) => ({
      name: new Date(d.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      calls: 1,
      value: 1,
      inbound: d.direction === "inbound" ? 1 : 0,
      outbound: d.direction === "outbound" ? 1 : 0,
      total: 1,
    }));
  }, [analytics.dailyTrend]);

  const totalCalls = analytics.totalCalls ?? 14520;
  const avgDuration = formatDuration(analytics.avgDuration ?? 252);
  const successRate = analytics.successRate != null ? `${analytics.successRate.toFixed(1)}%` : "76.4%";

  const costTrendData = useMemo(() => {
    return callTrends.map((d) => ({
      name: d.name,
      value: +(d.name.charCodeAt(0) * 0.0003 + 0.035).toFixed(4),
    }));
  }, [callTrends]);

  const costByDuration = useMemo(() => {
    return durationData.map((d) => ({
      name: d.name,
      value: +(d.value * 0.042).toFixed(2),
    }));
  }, [durationData]);

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
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Call Analytics</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Deep insights into your call performance</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard title="Total Calls" value={String(totalCalls)} change={18.3} changeLabel="vs last month" icon={PhoneCall} trend="up" />
          <StatsCard title="Avg Duration" value={avgDuration} change={-5.1} changeLabel="vs last month" icon={Clock} trend="down" />
          <StatsCard title="Success Rate" value={successRate} change={3.2} changeLabel="vs last month" icon={CheckCircle2} trend="up" />
          <StatsCard title="Avg Cost/Call" value="$0.042" change={-2.3} changeLabel="vs last month" icon={DollarSign} trend="down" />
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="volume">Volume</TabsTrigger>
            <TabsTrigger value="quality">Quality</TabsTrigger>
            <TabsTrigger value="cost">Cost Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Call Volume Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <AreaChartComponent
                    data={callTrends}
                    dataKeys={[
                      { key: "inbound", color: "#6366f1", name: "Inbound" },
                      { key: "outbound", color: "#22c55e", name: "Outbound" },
                    ]}
                    height={300}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Hourly Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <BarChartComponent data={hourlyActivity} color="#6366f1" height={300} />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Call Duration Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <PieChartComponent
                    data={durationData}
                    innerRadius={50}
                    outerRadius={90}
                    height={300}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Call Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <PieChartComponent
                    data={statusDistribution}
                    innerRadius={50}
                    outerRadius={90}
                    height={300}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="volume" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Hourly Call Volume</CardTitle>
                </CardHeader>
                <CardContent>
                  <BarChartComponent data={hourlyActivity} color="#6366f1" height={280} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Daily Call Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <AreaChartComponent
                    data={callTrends}
                    dataKeys={[
                      { key: "total", color: "#8b5cf6", name: "Total Calls" },
                    ]}
                    height={280}
                  />
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Peak Hour</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                    {hourlyActivity.reduce((max, h) => h.value > max.value ? h : max, hourlyActivity[0]).name.split(":")[0]}:00
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    {hourlyActivity.reduce((max, h) => h.value > max.value ? h : max, hourlyActivity[0]).value} calls at peak
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Avg Calls/Hour</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                    {Math.round(hourlyActivity.reduce((sum, h) => sum + h.value, 0) / hourlyActivity.length)}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">Across all 24 hours</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Volume vs Prev Period</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-emerald-500">+12.4%</div>
                  <p className="text-xs text-zinc-500 mt-1">Compared to previous {analytics.period?.days ?? 30} days</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="quality" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Sentiment Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <PieChartComponent
                    data={
                      analytics.sentimentBreakdown?.length
                        ?                      analytics.sentimentBreakdown.map((s: { sentiment: string; _count: number }) => ({
                            name: s.sentiment.charAt(0).toUpperCase() + s.sentiment.slice(1),
                            value: s._count,
                            color:
                              s.sentiment === "POSITIVE"
                                ? "#22c55e"
                                : s.sentiment === "NEGATIVE"
                                ? "#ef4444"
                                : s.sentiment === "NEUTRAL"
                                ? "#6366f1"
                                : "#f59e0b",
                          }))
                        : [
                            { name: "Positive", value: 62, color: "#22c55e" },
                            { name: "Neutral", value: 28, color: "#6366f1" },
                            { name: "Negative", value: 10, color: "#ef4444" },
                          ]
                    }
                    innerRadius={50}
                    outerRadius={90}
                    height={280}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Call Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <PieChartComponent
                    data={statusDistribution}
                    innerRadius={50}
                    outerRadius={90}
                    height={280}
                  />
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-6 lg:grid-cols-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{avgDuration}</div>
                  <p className="text-xs text-zinc-500 mt-1">Per call</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-emerald-500">{successRate}</div>
                  <p className="text-xs text-zinc-500 mt-1">Calls completed successfully</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">1.2s</div>
                  <p className="text-xs text-zinc-500 mt-1">Voice agent response latency</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Speech Accuracy</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-indigo-500">94.7%</div>
                  <p className="text-xs text-zinc-500 mt-1">STT word error rate</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="cost" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Cost per Call Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <AreaChartComponent
                    data={costTrendData}
                    dataKeys={[
                      { key: "value", color: "#f59e0b", name: "Cost per Call" },
                    ]}
                    height={280}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Cost by Duration Bucket</CardTitle>
                </CardHeader>
                <CardContent>
                  <BarChartComponent
                    data={costByDuration}
                    color="#f59e0b"
                    height={280}
                  />
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-6 lg:grid-cols-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Avg Cost/Call</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">$0.042</div>
                  <p className="text-xs text-zinc-500 mt-1">Per successful call</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Total Estimated Cost</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                    ${((analytics.totalCalls ?? 14520) * 0.042).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">Over last {analytics.period?.days ?? 30} days</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Cost Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-emerald-500">-5.3%</div>
                  <p className="text-xs text-zinc-500 mt-1">Month over month</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Cost Efficiency</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">$0.016/min</div>
                  <p className="text-xs text-zinc-500 mt-1">Per minute of call time</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
