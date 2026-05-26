"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, Download, Play, Pause, Trash2 } from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";

interface Recording {
  id: string;
  contactName?: string;
  contactPhone?: string;
  duration?: number;
  recordingDuration?: number;
  createdAt?: string;
  campaign?: { name: string };
  status?: string;
  recordingUrl?: string;
}

interface RecordingsResponse {
  recordings: Recording[];
}

export default function RecordingsPage() {
  const { data: recData, loading } = useApi<RecordingsResponse>("/api/recordings?limit=100");
  const [playing, setPlaying] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const recordings = useMemo(() => {
    const list = recData?.recordings ?? [];
    return list.map((r: Recording) => ({
      id: r.id,
      contact: r.contactName ?? "Unknown",
      phone: r.contactPhone ?? "",
      duration: r.duration ?? r.recordingDuration ?? 0,
      date: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "N/A",
      agent: r.campaign?.name ?? "AI Agent",
      status: r.status === "COMPLETED" ? "available" : "failed",
      size: r.recordingUrl ? "Audio" : "N/A",
    }));
  }, [recData]);

  const filtered = recordings.filter((r) =>
    r.contact.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDur = (seconds: number) => {
    if (!seconds) return "0m 0s";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  };

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
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Call Recordings</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Listen to recorded calls and review transcripts</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export All
            </Button>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Total Recordings</p>
              <p className="text-2xl font-bold mt-1">{recordings.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Available</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{recordings.filter((r) => r.status === "available").length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">No Recording</p>
              <p className="text-2xl font-bold mt-1">{recordings.filter((r) => r.status === "failed").length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Avg Duration</p>
              <p className="text-2xl font-bold mt-1">
                {recordings.length > 0
                  ? formatDur(recordings.reduce((sum: number, r) => sum + (r.duration ?? 0), 0) / recordings.length)
                  : "0m 0s"}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>All Recordings</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input placeholder="Search recordings..." className="pl-9 h-9 w-64" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-sm text-zinc-400">No recordings found.</p>
            ) : (
            <div className="space-y-2">
              {filtered.map((rec) => (
                <div key={rec.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700">
                  <button
                    onClick={() => setPlaying(playing === rec.id ? null : rec.id)}
                    className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center hover:bg-indigo-200 dark:hover:bg-indigo-900 transition-colors shrink-0"
                  >
                    {playing === rec.id ? (
                      <Pause className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <Play className="h-5 w-5 text-indigo-600 dark:text-indigo-400 ml-0.5" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{rec.contact}</p>
                    <p className="text-xs text-zinc-400">{rec.phone} · {rec.agent}</p>
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-zinc-500">{formatDur(rec.duration)}</span>
                    <span className="text-zinc-400">{rec.date}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-600">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
