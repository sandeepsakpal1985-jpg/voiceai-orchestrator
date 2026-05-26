"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, TrendingUp, PhoneCall, Clock, AlertTriangle, Zap, Cpu, Wifi, Phone, Mic, Brain, Volume2 } from "lucide-react";
import AreaChartComponent from "@/components/charts/area-chart";
import BarChartComponent from "@/components/charts/bar-chart";
import Navbar from "@/components/dashboard/navbar";
import { useSession } from "next-auth/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebSocket } from "@/hooks/use-websocket";
import { useRuntimeStatus } from "@/hooks/use-runtime-status";

const fallbackData = {
  activeCalls: 19,
  callsToday: 1247,
  pctChange: 12.4,
  inQueue: 9,
  avgWaitSeconds: 32,
  alertsCount: 2,
  callFlow: [
    { name: "09:00", calls: 25, active: 8, queued: 3 },
    { name: "09:05", calls: 32, active: 12, queued: 5 },
    { name: "09:10", calls: 28, active: 10, queued: 4 },
    { name: "09:15", calls: 45, active: 15, queued: 7 },
    { name: "09:20", calls: 38, active: 13, queued: 6 },
    { name: "09:25", calls: 42, active: 14, queued: 5 },
    { name: "09:30", calls: 35, active: 11, queued: 4 },
    { name: "09:35", calls: 48, active: 16, queued: 8 },
    { name: "09:40", calls: 52, active: 18, queued: 6 },
    { name: "09:45", calls: 44, active: 15, queued: 5 },
    { name: "09:50", calls: 50, active: 17, queued: 7 },
    { name: "09:55", calls: 55, active: 19, queued: 9 },
  ],
  agentPerformance: [
    { name: "Alpha", value: 4, active: 4, available: 2, busy: 1 },
    { name: "Beta", value: 3, active: 3, available: 3, busy: 0 },
    { name: "Gamma", value: 5, active: 5, available: 1, busy: 1 },
    { name: "Delta", value: 2, active: 2, available: 4, busy: 0 },
    { name: "Epsilon", value: 4, active: 4, available: 2, busy: 1 },
  ],
  agentStatuses: [
    { name: "Support Alpha", status: "on_call", activeCalls: 3, avgTime: "4m 32s", today: 47 },
    { name: "Sales Beta", status: "available", activeCalls: 0, avgTime: "3m 15s", today: 38 },
    { name: "Support Gamma", status: "on_call", activeCalls: 2, avgTime: "5m 12s", today: 52 },
    { name: "Sales Delta", status: "break", activeCalls: 0, avgTime: "2m 45s", today: 28 },
    { name: "Support Epsilon", status: "on_call", activeCalls: 4, avgTime: "6m 05s", today: 61 },
  ],
};

export default function RealtimeDashboardPage() {
  const { data: session } = useSession();
  const { data: wsData, status: wsStatus } = useWebSocket<typeof fallbackData>({
    channels: ["realtime-dashboard"],
    userId: session?.user?.id ?? null,
  });

  const data = wsData ?? fallbackData;
  const callFlowData = data.callFlow ?? fallbackData.callFlow;
  const agentPerfData = data.agentPerformance ?? fallbackData.agentPerformance;
  const agentStatusList = data.agentStatuses ?? fallbackData.agentStatuses;

  // Fetch runtime status from FastAPI backend
  const {
    status: runtimeStatus,
    livekit,
    sip,
    providers,
  } = useRuntimeStatus();

  if (wsStatus === "connecting" && !wsData) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navbar />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
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
            <Activity className="h-6 w-6 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Realtime Dashboard</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Live metrics updated every 5 seconds</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success" className="gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </Badge>
            <Button variant="outline" size="sm">
              <Zap className="h-4 w-4 mr-1" />
              Configure Alerts
            </Button>
          </div>
        </div>

        {/* Live Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-indigo-200">Active Calls</p>
              <PhoneCall className="h-5 w-5 text-indigo-200" />
            </div>
            <p className="text-4xl font-bold">{data.activeCalls}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-emerald-200">Calls Today</p>
              <TrendingUp className="h-5 w-5 text-emerald-200" />
            </div>
            <p className="text-4xl font-bold">{data.callsToday?.toLocaleString()}</p>
            <p className="text-sm text-emerald-200 mt-1">{data.pctChange > 0 ? '+' : ''}{data.pctChange}% vs yesterday</p>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-amber-700 rounded-xl p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-amber-200">In Queue</p>
              <Clock className="h-5 w-5 text-amber-200" />
            </div>
            <p className="text-4xl font-bold">{data.inQueue}</p>
            <p className="text-sm text-amber-200 mt-1">Avg wait: {data.avgWaitSeconds}s</p>
          </div>
          <div className="bg-gradient-to-br from-rose-500 to-rose-700 rounded-xl p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-rose-200">Alerts</p>
              <AlertTriangle className="h-5 w-5 text-rose-200" />
            </div>
            <p className="text-4xl font-bold">{data.alertsCount}</p>
            <p className="text-sm text-rose-200 mt-1">Requires attention</p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Live Call Flow</CardTitle>
            </CardHeader>
            <CardContent>
              <AreaChartComponent
                data={callFlowData.map((d) => ({ ...d, value: d.calls }))}
                dataKeys={[
                  { key: "calls", color: "#6366f1", name: "Total" },
                  { key: "active", color: "#22c55e", name: "Active" },
                  { key: "queued", color: "#f59e0b", name: "Queued" },
                ]}
                height={280}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Agent Status Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChartComponent
                data={agentPerfData.map((a) => ({
                  name: a.name,
                  value: a.active,
                  active: a.active,
                  available: a.available,
                  busy: a.busy
                }))}
                dataKey="active"
                color="#6366f1"
                height={280}
              />
            </CardContent>
          </Card>
        </div>

        {/* Runtime Systems Status */}
        <Card>
          <CardHeader>
            <CardTitle>Runtime Systems</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className={`rounded-lg border p-4 ${livekit?.connected ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10" : "border-zinc-200 dark:border-zinc-800"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Wifi className={`h-4 w-4 ${livekit?.connected ? "text-emerald-500" : "text-zinc-400"}`} />
                    <span className="text-sm font-medium">LiveKit</span>
                  </div>
                  <Badge variant={livekit?.connected ? "success" : "secondary"} className="text-[10px]">
                    {livekit?.connected ? `${livekit.active_rooms} rooms` : "Offline"}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 truncate" title={livekit?.url}>{livekit?.url || "—"}</p>
              </div>
              <div className={`rounded-lg border p-4 ${sip?.active_calls > 0 ? "border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10" : "border-zinc-200 dark:border-zinc-800"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Phone className={`h-4 w-4 ${sip?.active_calls > 0 ? "text-indigo-500" : "text-zinc-400"}`} />
                    <span className="text-sm font-medium">SIP / Twilio</span>
                  </div>
                  <Badge variant={sip?.active_calls > 0 ? "primary" : "secondary"} className="text-[10px]">
                    {sip?.active_calls > 0 ? `${sip.active_calls} active` : "Idle"}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500">Port {sip?.sip_port ?? "5060"}</p>
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium">Providers</span>
                  </div>
                  <Badge variant={runtimeStatus === "healthy" ? "success" : "warning"} className="text-[10px]">
                    {runtimeStatus}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Mic className="h-3 w-3" /> {providers?.active?.stt ?? "—"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Brain className="h-3 w-3" /> {providers?.active?.llm ?? "—"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Volume2 className="h-3 w-3" /> {providers?.active?.tts ?? "—"}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agent Status Table */}
        <Card>
          <CardHeader>
            <CardTitle>Agent Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Agent</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Active Calls</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Avg Handle Time</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Today</th>
                  </tr>
                </thead>
                <tbody>
                  {agentStatusList.map((agent, i: number) => (
                    <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      <td className="py-3 px-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">{agent.name}</td>
                      <td className="py-3 px-4">
                        <Badge variant={agent.status === "on_call" ? "primary" : agent.status === "available" ? "success" : "warning"}>
                          {agent.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm text-zinc-600 dark:text-zinc-400">{agent.activeCalls}</td>
                      <td className="py-3 px-4 text-sm text-zinc-600 dark:text-zinc-400">{agent.avgTime}</td>
                      <td className="py-3 px-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">{agent.today}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
