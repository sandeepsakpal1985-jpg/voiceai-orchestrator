"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Volume2, Wifi, PhoneOff, Mic, AlertTriangle, Radio, Search, Users, Phone, Cpu } from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebSocket } from "@/hooks/use-websocket";
import { useRuntimeStatus } from "@/hooks/use-runtime-status";

const fallbackData = {
  activeCalls: [
    { id: "1", contact: "Sarah Johnson", phone: "+1 (555) 123-4567", duration: "4m 32s", agent: "Support Agent Alpha", sentiment: "positive", status: "active" },
    { id: "2", contact: "Michael Chen", phone: "+1 (555) 234-5678", duration: "2m 15s", agent: "Sales Agent Beta", sentiment: "neutral", status: "active" },
    { id: "3", contact: "Emily Rodriguez", phone: "+1 (555) 345-6789", duration: "8m 12s", agent: "Support Agent Alpha", sentiment: "very_positive", status: "active" },
    { id: "4", contact: "James Wilson", phone: "+1 (555) 456-7890", duration: "1m 05s", agent: "Sales Agent Beta", sentiment: "negative", status: "active" },
  ],
  queueCount: 7,
  avgWaitSeconds: 45,
  activeAgentCount: 12,
  agentsOnCalls: 4,
  agentsAvailable: 8,
  todayTotal: 342,
  todayCompleted: 305,
  answerRate: 89.2,
};

export default function LiveMonitoringPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: session } = useSession();
  const { data: wsData, status: wsStatus } = useWebSocket<typeof fallbackData>({
    channels: ["live-monitoring"],
    userId: session?.user?.id ?? null,
  });

  const data = wsData ?? fallbackData;
  const activeCalls = data.activeCalls ?? fallbackData.activeCalls;

  const filteredCalls = activeCalls.filter((call) =>
    call.contact.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Fetch runtime status from FastAPI backend
  const {
    status: runtimeStatus,
    livekit,
    sip,
    providers,
    errors,
  } = useRuntimeStatus();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse absolute -top-1 -right-1" />
                <Radio className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Live Monitoring</h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Real-time call monitoring and intervention</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Runtime Status Badges */}
            <Badge variant={runtimeStatus === "healthy" ? "success" : "warning"} className="gap-1.5 px-3 py-1.5">
              <div className={`h-2 w-2 rounded-full ${runtimeStatus === "healthy" ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              Runtime: {runtimeStatus}
            </Badge>
            <Badge variant={livekit?.connected ? "success" : "secondary"} className="gap-1.5 px-3 py-1.5">
              <Wifi className="h-3 w-3" />
              LiveKit: {livekit?.connected ? `${livekit.active_rooms} rooms` : "Disconnected"}
            </Badge>
            <Badge variant={sip?.active_calls > 0 ? "success" : "secondary"} className="gap-1.5 px-3 py-1.5">
              <Phone className="h-3 w-3" />
              SIP: {sip?.active_calls ?? 0} calls
            </Badge>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search calls..."
                className="pl-9 h-9 w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Badge variant="success" className="gap-1.5 px-3 py-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {activeCalls.length} Active Calls
            </Badge>
          </div>
        </div>

        {/* Active Calls Grid */}
        {wsStatus === "connecting" && filteredCalls.length === 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredCalls.map((call) => (
            <Card key={call.id} className="group hover:shadow-lg transition-all duration-200 border-l-4 border-l-emerald-500">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                      <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{call.contact}</p>
                      <p className="text-sm text-zinc-500">{call.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs text-emerald-600 font-medium">{call.duration}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <Mic className="h-4 w-4 text-zinc-400" />
                  <span className="text-sm text-zinc-500">Agent:</span>
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{call.agent}</span>
                </div>

                {/* Live Transcription Preview */}
                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 mb-4 min-h-[60px]">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 italic">
                    &ldquo;I understand your concern, let me check that for you right away...&rdquo;
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={call.sentiment === "positive" || call.sentiment === "very_positive" ? "success" : call.sentiment === "negative" ? "danger" : "default"}>
                      {call.sentiment.replace("_", " ")}
                    </Badge>
                    {call.sentiment === "negative" && (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      <Volume2 className="h-4 w-4 mr-1" />
                      Listen
                    </Button>
                    <Button variant="destructive" size="sm">
                      <PhoneOff className="h-4 w-4 mr-1" />
                      End Call
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        )}

        {/* Queue & Stats */}
        <div className="grid gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-zinc-500">Calls in Queue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{data.queueCount}</p>
              <p className="text-sm text-zinc-500 mt-1">Avg wait: {data.avgWaitSeconds} seconds</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-zinc-500">Active Agents</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{data.activeAgentCount}</p>
              <p className="text-sm text-emerald-600 mt-1">{data.agentsAvailable} available, {data.agentsOnCalls} on calls</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-zinc-500">LiveKit Rooms</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{livekit?.active_rooms ?? 0}</p>
              <p className={`text-sm mt-1 ${livekit?.connected ? "text-emerald-600" : "text-zinc-500"}`}>
                {livekit?.connected ? "Connected" : "Disconnected"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-zinc-500">Today&apos;s Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{data.todayTotal}</p>
                  <p className="text-sm text-zinc-500">Total calls</p>
                </div>
                <div className="h-10 w-px bg-zinc-200 dark:bg-zinc-800" />
                <div>
                  <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{data.answerRate}%</p>
                  <p className="text-sm text-zinc-500">Answer rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Runtime Provider Status */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Runtime Status</CardTitle>
              <Badge variant={runtimeStatus === "healthy" ? "success" : "warning"} className="text-xs">
                <Cpu className="h-3 w-3 mr-1" />
                {runtimeStatus === "healthy" ? "All Systems Online" : runtimeStatus === "degraded" ? "Degraded" : "Offline"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Mic className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm font-medium">STT: {providers?.active?.stt ?? "—"}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {providers?.registered?.stt?.map((p) => (
                    <Badge key={p.name} variant={p.is_active ? "default" : "outline"} className="text-[10px]">
                      {p.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium">LLM: {providers?.active?.llm ?? "—"}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {providers?.registered?.llm?.map((p) => (
                    <Badge key={p.name} variant={p.is_active ? "default" : "outline"} className="text-[10px]">
                      {p.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Volume2 className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">TTS: {providers?.active?.tts ?? "—"}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {providers?.registered?.tts?.map((p) => (
                    <Badge key={p.name} variant={p.is_active ? "default" : "outline"} className="text-[10px]">
                      {p.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            {errors && errors.length > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">System Errors</p>
                {errors.map((e: {source: string; error: string}, i: number) => (
                  <p key={i} className="text-xs text-red-500 dark:text-red-400">{e.source}: {e.error}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
