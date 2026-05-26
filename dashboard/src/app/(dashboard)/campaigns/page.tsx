"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Megaphone, Plus, Search, Play, Pause, BarChart3, Eye } from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";

interface CampaignRecord {
  id: string;
  name: string;
  status?: string;
  totalCalls?: number;
  completedCalls?: number;
  successRate?: number;
  createdAt?: string;
  description?: string;
  script?: string;
  _count?: { callLogs: number };
}

interface CampaignsResponse {
  campaigns: CampaignRecord[];
}

const statusColors: Record<string, "success" | "warning" | "default" | "primary"> = {
  active: "success",
  paused: "warning",
  draft: "default",
  completed: "primary",
  archived: "default",
};

export default function CampaignsPage() {
  const { data: campaignsData, loading } = useApi<CampaignsResponse>("/api/campaigns");
  const [searchQuery, setSearchQuery] = useState("");

  const campaigns = useMemo(() => {
    const list = campaignsData?.campaigns ?? [];
    return list.map((c: CampaignRecord) => ({
      id: c.id,
      name: c.name,
      status: c.status?.toLowerCase() ?? "draft",
      totalCalls: c.totalCalls ?? c._count?.callLogs ?? 0,
      completedCalls: c.completedCalls ?? 0,
      successRate: c.successRate ?? 0,
      createdAt: c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "N/A",
      script: c.description ?? c.script ?? "No description",
    }));
  }, [campaignsData]);

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
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
          <div className="flex items-center gap-3">
            <Megaphone className="h-6 w-6 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Campaign Manager</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Create and manage outbound call campaigns</p>
            </div>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Active Campaigns</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{campaigns.filter((c) => c.status === "active").length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Total Calls</p>
              <p className="text-2xl font-bold mt-1">              {campaigns.reduce((sum: number, c) => sum + c.totalCalls, 0).toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Avg. Success Rate</p>
              <p className="text-2xl font-bold mt-1">
                {campaigns.length > 0
                  ? `${(campaigns.reduce((sum: number, c) => sum + c.successRate, 0) / campaigns.length).toFixed(1)}%`
                  : "0%"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Drafts</p>
              <p className="text-2xl font-bold mt-1">{campaigns.filter((c) => c.status === "draft").length}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>All Campaigns</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input placeholder="Search campaigns..." className="pl-9 h-9 w-64" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-sm text-zinc-400">No campaigns found. Create your first campaign to get started.</p>
            ) : (
            <div className="space-y-4">
              {filtered.map((campaign) => (
                <div key={campaign.id} className="flex items-center gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors">
                  <div className="h-12 w-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                    <Megaphone className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{campaign.name}</p>
                      <Badge variant={statusColors[campaign.status] ?? "default"}>
                        {campaign.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-zinc-500 mb-2 line-clamp-1">{campaign.script}</p>
                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span>{campaign.completedCalls}/{campaign.totalCalls} calls</span>
                      <span>Created: {campaign.createdAt}</span>
                    </div>
                    {campaign.totalCalls > 0 && (
                      <Progress value={(campaign.completedCalls / campaign.totalCalls) * 100} className="mt-2 h-1.5" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      {campaign.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="sm">
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4" />
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
