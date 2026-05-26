"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, Download, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";

interface CallRecord {
  id: string;
  contactName?: string;
  contactPhone?: string;
  duration?: number;
  status?: string;
  direction?: string;
  cost?: number;
  sentiment?: string;
  createdAt?: string;
}

interface CallsResponse {
  calls: CallRecord[];
  total?: number;
}

export default function CallHistoryPage() {
  const { data: callsData, loading } = useApi<CallsResponse>("/api/calls?limit=100");
  const [searchQuery, setSearchQuery] = useState("");

  const calls = useMemo(() => {
    const list = callsData?.calls ?? [];
    return list.map((c: CallRecord) => ({
      id: c.id,
      contact: c.contactName ?? "Unknown",
      phone: c.contactPhone ?? "",
      duration: c.duration ?? 0,
      status: c.status?.toLowerCase() ?? "unknown",
      direction: c.direction ?? "outbound",
      cost: c.cost ?? 0,
      sentiment: c.sentiment?.toLowerCase().replace("_", "_") ?? "neutral",
      createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
    }));
  }, [callsData]);

  const totalCalls = callsData?.total ?? calls.length;
  const completedCalls = calls.filter((c) => c.status === "completed").length;
  const failedCalls = calls.filter((c) => c.status === "failed" || c.status === "no_answer" || c.status === "busy").length;
  const avgDurationMs = calls.length > 0
    ? calls.reduce((sum: number, c) => sum + (c.duration || 0), 0) / calls.length
    : 0;
  const avgDurationMin = Math.floor(avgDurationMs / 60);
  const avgDurationSec = Math.round(avgDurationMs % 60);

  const formatDur = (seconds: number) => {
    if (!seconds) return "0m 0s";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  };

  const filtered = calls.filter((call) =>
    call.contact.toLowerCase().includes(searchQuery.toLowerCase()) ||
    call.phone.includes(searchQuery)
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navbar />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-28 w-full rounded-xl" />
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
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Call History</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Review past calls and performance</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Total Calls</p>
              <p className="text-2xl font-bold mt-1">{totalCalls.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Completed</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{completedCalls.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Failed</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{failedCalls.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Avg Duration</p>
              <p className="text-2xl font-bold mt-1">{avgDurationMin}m {avgDurationSec.toString().padStart(2, "0")}s</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Call Records</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input
                  placeholder="Search calls..."
                  className="pl-9 h-9 w-72"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-sm text-zinc-400">No calls found.</p>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Contact</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Direction</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Duration</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Sentiment</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Cost</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Date</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((call) => (
                    <tr key={call.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{call.contact}</p>
                          <p className="text-xs text-zinc-400">{call.phone}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                          {call.direction === "outbound" ? (
                            <PhoneOutgoing className="h-4 w-4 text-indigo-500" />
                          ) : (
                            <PhoneIncoming className="h-4 w-4 text-emerald-500" />
                          )}
                          {call.direction}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-zinc-600 dark:text-zinc-400">{formatDur(call.duration)}</td>
                      <td className="py-3 px-4">
                        <Badge variant={
                          call.status === "completed" ? "success" :
                          call.status === "failed" ? "danger" :
                          call.status === "no_answer" ? "warning" : "default"
                        }>
                          {call.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={
                          call.sentiment === "very_positive" || call.sentiment === "positive" ? "success" :
                          call.sentiment === "negative" ? "danger" : "default"
                        }>
                          {call.sentiment.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm text-zinc-600 dark:text-zinc-400">${(call.cost ?? 0).toFixed(4)}</td>
                      <td className="py-3 px-4 text-sm text-zinc-500">
                        <p>{call.createdAt.toLocaleDateString()}</p>
                        <p className="text-xs">{call.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      </td>
                      <td className="py-3 px-4">
                        <Button variant="ghost" size="sm">View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
