"use client";

import { useState, useEffect, useCallback } from "react";
import { trackPageView, useTrackingCleanup } from "@/lib/tracking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import Navbar from "@/components/dashboard/navbar";
import {
  Activity,
  Eye,
  MousePointerClick,
  RefreshCw,
  Filter,
  X,
  Calendar,
  Globe,
  Languages,
  Play,
  ArrowRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────

interface TrackingEvent {
  type: "page_view" | "interaction";
  page: string;
  action: string;
  label?: string;
  value?: string | number;
  timestamp: number;
}

interface TrackingResponse {
  total: number;
  events: TrackingEvent[];
}

// ── Helpers ───────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getEventIcon(type: string, action: string) {
  if (type === "page_view") return Eye;
  if (action === "select_language") return Languages;
  if (action === "play_sample") return Play;
  if (action === "switch_tab") return ArrowRight;
  if (action === "start_demo" || action === "complete_demo") return Globe;
  return MousePointerClick;
}

function getEventColor(action: string): string {
  switch (action) {
    case "view": return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300";
    case "select_language": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";
    case "play_sample": return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
    case "switch_tab": return "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300";
    case "start_demo": return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300";
    case "complete_demo": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";
    case "try_demo": return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    default: return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

function getPageLabel(page: string): string {
  const labels: Record<string, string> = {
    "/multilingual-demo": "Multilingual Demo",
  };
  return labels[page] || page;
}

// ── Main Page ─────────────────────────────────────────────────────

export default function TrackingEventsPage() {
  const [data, setData] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchEvents = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/tracking");
      if (!res.ok) {
        if (res.status === 401) {
          setError("Authentication required — sign in to view tracking events");
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    trackPageView("/analytics/events", "Tracking Events Page");
    fetchEvents();
  }, [fetchEvents]);

  // Cleanup tracking queue on unmount
  useEffect(() => useTrackingCleanup(), []);

  // Auto-refresh every 10 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchEvents, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchEvents]);

  // Extract unique actions for filter dropdown
  const uniqueActions = data?.events
    ? [...new Set(data.events.map((e) => e.action))]
    : [];

  // Filter events
  const filteredEvents = data?.events.filter((event) => {
    if (typeFilter !== "all" && event.type !== typeFilter) return false;
    if (actionFilter !== "all" && event.action !== actionFilter) return false;
    return true;
  }) ?? [];

  // Count by type
  const pageViews = data?.events.filter((e) => e.type === "page_view").length ?? 0;
  const interactions = data?.events.filter((e) => e.type === "interaction").length ?? 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                Tracking Events
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Monitor user interactions and page views across the dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? "border-indigo-300 text-indigo-600" : ""}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? "animate-spin" : ""}`} />
              {autoRefresh ? "Auto Refresh On" : "Auto Refresh"}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchEvents}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-500">Total Events</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                  {data?.total ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-500">Page Views</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="flex items-center gap-2">
                  <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{pageViews}</div>
                  <Eye className="h-4 w-4 text-indigo-400" />
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-500">Interactions</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="flex items-center gap-2">
                  <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{interactions}</div>
                  <MousePointerClick className="h-4 w-4 text-emerald-400" />
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-500">Unique Actions</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                  {uniqueActions.length}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Filters</span>
              </div>

              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-700 dark:text-zinc-300"
                aria-label="Filter by event type"
              >
                <option value="all">All Types</option>
                <option value="page_view">Page Views</option>
                <option value="interaction">Interactions</option>
              </select>

              {/* Action Filter */}
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-700 dark:text-zinc-300"
                aria-label="Filter by action"
              >
                <option value="all">All Actions</option>
                {uniqueActions.map((action) => (
                  <option key={action} value={action}>
                    {action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>

              {/* Clear Filters */}
              {(typeFilter !== "all" || actionFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setTypeFilter("all"); setActionFilter("all"); }}
                  className="text-zinc-500"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}

              <div className="ml-auto text-xs text-zinc-400">
                {loading ? "Loading..." : `${filteredEvents.length} events shown`}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error State */}
        {error && (
          <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50">
            <CardContent className="py-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Events List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Event Stream</CardTitle>
              {data && (
                <Badge variant="outline" size="sm">
                  <Calendar className="h-3 w-3 mr-1" />
                  Live
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                <Activity className="h-12 w-12 mb-3 text-zinc-300" />
                <p className="text-sm font-medium">No events found</p>
                <p className="text-xs mt-1">
                  {typeFilter !== "all" || actionFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Events will appear here as users interact with dashboard pages"}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredEvents.map((event, i) => {
                  const Icon = getEventIcon(event.type, event.action);
                  return (
                    <div
                      key={`${event.timestamp}-${i}`}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${getEventColor(event.action)}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                            {event.action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                          {event.label && (
                            <span className="text-xs text-zinc-400 truncate">
                              — {event.label}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400">
                          {getPageLabel(event.page)}
                          {event.value && ` · ${event.value}`}
                        </p>
                      </div>
                      <Badge variant="outline" size="sm" className="shrink-0 capitalize">
                        {event.type === "page_view" ? "View" : "Interaction"}
                      </Badge>
                      <span
                        className="text-xs text-zinc-400 shrink-0"
                        title={new Date(event.timestamp).toLocaleString()}
                      >
                        {formatTime(event.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
