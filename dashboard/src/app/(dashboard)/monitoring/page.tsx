"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  Server,
  Cpu,
  HardDrive,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  BarChart3,
  FileText,
} from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import { Skeleton } from "@/components/ui/skeleton";
import BarChartComponent from "@/components/charts/bar-chart";
import { ErrorBoundary } from "@/components/ui/error-boundary";

// ── Types ──────────────────────────────────────────────────────────

interface RouteMetric {
  path: string;
  method: string;
  count: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  errors: number;
  statusCodes: Record<string, number>;
  lastRequest: number;
}

interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  path?: string;
  durationMs?: number;
  statusCode?: number;
  error?: string;
  timestamp: number;
}

interface MonitoringData {
  uptime: number;
  totalRequests: number;
  routes: RouteMetric[];
  wsClients: number;
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
  recentLogs: LogEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function getLevelBadge(level: string): "danger" | "warning" | "default" {
  switch (level) {
    case "error": return "danger";
    case "warn": return "warning";
    default: return "default";
  }
}

// ── Page Component ─────────────────────────────────────────────────

function MonitoringPageInner() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/monitoring");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/monitoring");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMetrics]);

  // Reset metrics
  const resetMetrics = useCallback(async () => {
    try {
      await fetch("/api/monitoring", { method: "POST" });
      fetchMetrics();
    } catch {
      // ignore
    }
  }, [fetchMetrics]);

  // Build chart data from routes
  const routeChartData = useMemo(() => {
    if (!data?.routes) return [];
    const sorted = [...data.routes].sort((a, b) => b.count - a.count).slice(0, 10);
    return sorted.map((r) => ({
      name: r.path.replace("/api/", ""),
      requests: r.count,
      avgMs: r.avgDurationMs,
      errors: r.errors,
      value: r.count,
    }));
  }, [data]);

  // Build duration distribution
  const durationChartData = useMemo(() => {
    if (!data?.routes || data.routes.length === 0) return [];
    const buckets = [0, 50, 100, 200, 500, 1000, 2000, 5000];
    const labels = ["<50ms", "50-100ms", "100-200ms", "200-500ms", "500ms-1s", "1-2s", "2-5s", ">5s"];
    const counts = new Array(buckets.length).fill(0);

    for (const route of data.routes) {
      let placed = false;
      for (let i = 0; i < buckets.length; i++) {
        if (route.avgDurationMs < buckets[i]) {
          counts[i]++;
          placed = true;
          break;
        }
      }
      if (!placed) counts[counts.length - 1]++;
    }

    // Merge last two if sparse
    return labels.map((name, i) => ({
      name,
      value: counts[i],
      count: counts[i],
    }));
  }, [data]);

  // Error rate per route
  const avgErrorRate = useMemo(() => {
    if (!data?.routes || data.routes.length === 0) return 0;
    const total = data.routes.reduce((s, r) => s + r.count, 0);
    const errors = data.routes.reduce((s, r) => s + r.errors, 0);
    return total > 0 ? ((errors / total) * 100).toFixed(1) : "0.0";
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navbar />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">System Monitoring</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Performance metrics, error tracking, and live logs
                {data && <span className="ml-2">· Uptime: {formatUptime(data.uptime)}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <Clock className="h-4 w-4 mr-1" />
              {autoRefresh ? "Auto (10s)" : "Manual"}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchMetrics}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Button variant="destructive" size="sm" onClick={resetMetrics}>
              <Trash2 className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30">
            <CardContent className="p-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <p className="text-sm text-red-600 dark:text-red-400">Failed to fetch metrics: {error}</p>
            </CardContent>
          </Card>
        )}

        {/* System Health Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-500">Total Requests</CardTitle>
              <BarChart3 className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {data?.totalRequests?.toLocaleString() ?? 0}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Across {(data?.routes?.length ?? 0)} routes
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-500">Error Rate</CardTitle>
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {avgErrorRate}%
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                {data?.routes?.reduce((s, r) => s + r.errors, 0) ?? 0} total errors
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-500">WebSocket Clients</CardTitle>
              <Server className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {data?.wsClients ?? 0}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Currently connected</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-500">Memory (RSS)</CardTitle>
              <HardDrive className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {data?.memory?.rssMB ?? 0} MB
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Heap: {data?.memory?.heapUsedMB ?? 0}MB / {data?.memory?.heapTotalMB ?? 0}MB
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts & Logs */}
        <Tabs defaultValue="routes" className="space-y-4">
          <TabsList>
            <TabsTrigger value="routes">
              <BarChart3 className="h-4 w-4 mr-1.5" />
              Routes
            </TabsTrigger>
            <TabsTrigger value="duration">
              <Cpu className="h-4 w-4 mr-1.5" />
              Duration Distribution
            </TabsTrigger>
            <TabsTrigger value="logs">
              <FileText className="h-4 w-4 mr-1.5" />
              Recent Logs
            </TabsTrigger>
          </TabsList>

          {/* Route Performance */}
          <TabsContent value="routes" className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top Routes by Request Count</CardTitle>
                </CardHeader>
                <CardContent>
                  {routeChartData.length > 0 ? (
                    <BarChartComponent
                      data={routeChartData}
                      dataKey="requests"
                      color="#6366f1"
                      height={300}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-zinc-400">
                      <p>No route data yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Route Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-zinc-800">
                          <th className="text-left py-2 px-2 text-xs font-medium text-zinc-500 uppercase">Route</th>
                          <th className="text-right py-2 px-2 text-xs font-medium text-zinc-500 uppercase">Count</th>
                          <th className="text-right py-2 px-2 text-xs font-medium text-zinc-500 uppercase">Avg (ms)</th>
                          <th className="text-right py-2 px-2 text-xs font-medium text-zinc-500 uppercase">Errors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data?.routes?.slice(0, 20).map((route, i) => (
                          <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                            <td className="py-2 px-2 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                              <span className="text-zinc-400">{route.method}</span> {route.path.replace("/api/", "")}
                            </td>
                            <td className="py-2 px-2 text-right text-zinc-600 dark:text-zinc-400">{route.count}</td>
                            <td className="py-2 px-2 text-right text-zinc-600 dark:text-zinc-400">{route.avgDurationMs}</td>
                            <td className="py-2 px-2 text-right">
                              {route.errors > 0 ? (
                                <span className="text-red-500 font-medium">{route.errors}</span>
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                              )}
                            </td>
                          </tr>
                        ))}
                        {(!data?.routes || data.routes.length === 0) && (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-zinc-400">
                              No routes recorded yet. Make some API requests and come back.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Duration Distribution */}
          <TabsContent value="duration">
            <Card>
              <CardHeader>
                <CardTitle>Response Time Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {durationChartData.length > 0 ? (
                  <BarChartComponent
                    data={durationChartData}
                    dataKey="count"
                    color="#22c55e"
                    height={350}
                  />
                ) : (
                  <div className="flex items-center justify-center h-[350px] text-zinc-400">
                    <p>No timing data yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Logs */}
          <TabsContent value="logs">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Recent Logs</CardTitle>
                <Badge variant="default">{data?.recentLogs?.length ?? 0} entries</Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-[500px] overflow-y-auto font-mono text-xs">
                  {data?.recentLogs && data.recentLogs.length > 0 ? (
                    data.recentLogs.map((log, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 py-1.5 px-2 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                      >
                        <Badge variant={getLevelBadge(log.level)} className="w-12 shrink-0 text-center justify-center">
                          {log.level}
                        </Badge>
                        <span className="text-zinc-400 shrink-0 w-20">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="text-zinc-700 dark:text-zinc-300 flex-1">{log.message}</span>
                        {log.path && (
                          <span className="text-zinc-400 shrink-0">{log.path}</span>
                        )}
                        {log.durationMs && (
                          <span className="text-zinc-400 shrink-0 w-16 text-right">{log.durationMs}ms</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-zinc-400">
                      No logs yet
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function MonitoringPage() {
  return (
    <ErrorBoundary>
      <MonitoringPageInner />
    </ErrorBoundary>
  );
}
