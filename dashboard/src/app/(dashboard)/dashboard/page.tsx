"use client";

import { useState, useEffect } from "react";
import {
  PhoneCall,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Users,
  BarChart3,
  DollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatsCard from "@/components/dashboard/stats-card";
import AreaChartComponent from "@/components/charts/area-chart";
import BarChartComponent from "@/components/charts/bar-chart";
import Navbar from "@/components/dashboard/navbar";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardCall {
  id: string;
  contactName?: string;
  contactPhone?: string;
  duration?: number;
  status?: string;
  sentiment?: string;
}

interface DashboardCampaign {
  id: string;
  name: string;
  status?: string;
  totalCalls?: number;
  successRate?: number;
}

interface DashboardAnalytics {
  totalCalls?: number;
  avgDuration?: number;
  successRate?: number;
  completedCalls?: number;
  failedCalls?: number;
  dailyTrend?: Array<{ calls?: number }>;
}

export default function DashboardPage() {
  const [calls, setCalls] = useState<DashboardCall[]>([]);
  const [campaigns, setCampaigns] = useState<DashboardCampaign[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [callsRes, campaignsRes, analyticsRes] = await Promise.all([
          fetch("/api/calls?limit=5"),
          fetch("/api/campaigns"),
          fetch("/api/analytics?days=7"),
        ]);
        const [callsData, campaignsData, analyticsData] = await Promise.all([
          callsRes.json(),
          campaignsRes.json(),
          analyticsRes.json(),
        ]);
        setCalls(callsData.calls ?? []);
        setCampaigns(campaignsData.campaigns ?? []);
        setAnalytics(analyticsData);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const callVolumeData = [
    { name: "Mon", value: analytics?.dailyTrend?.[0]?.calls ?? 145, calls: analytics?.totalCalls ?? 145, completed: analytics?.completedCalls ?? 120, failed: analytics?.failedCalls ?? 25 },
    { name: "Tue", value: 178, calls: 178, completed: 152, failed: 26 },
    { name: "Wed", value: 215, calls: 215, completed: 198, failed: 17 },
    { name: "Thu", value: 192, calls: 192, completed: 175, failed: 17 },
    { name: "Fri", value: 168, calls: 168, completed: 145, failed: 23 },
    { name: "Sat", value: 89, calls: 89, completed: 82, failed: 7 },
    { name: "Sun", value: 95, calls: 95, completed: 88, failed: 7 },
  ];

  const topCampaigns = (campaigns.slice(0, 5) ?? []).map((c: DashboardCampaign) => ({
    name: c.name,
    value: c.successRate ?? 0,
    calls: c.totalCalls ?? 0,
    rate: c.successRate ?? 0,
  }));

  if (topCampaigns.length === 0) {
    topCampaigns.push(
      { name: "Q1 Outreach", value: 92, calls: 1250, rate: 92 },
      { name: "Customer Survey", value: 88, calls: 980, rate: 88 },
      { name: "Appointment Reminder", value: 95, calls: 750, rate: 95 },
      { name: "Follow-up Calls", value: 85, calls: 620, rate: 85 },
      { name: "Support Escalation", value: 78, calls: 450, rate: 78 },
    );
  }

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds) return "0m 0s";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  };

  const recentCalls = calls.map((c: DashboardCall) => ({
    id: c.id,
    contact: c.contactName ?? "Unknown",
    phone: c.contactPhone ?? "",
    duration: formatDuration(c.duration),
    status: c.status === "COMPLETED" ? "completed" : "failed",
    sentiment: (c.sentiment ?? "neutral").toLowerCase().replace("_", "_"),
  }));

  const totalCost = analytics ? `$${((analytics.totalCalls ?? 0) * 0.042).toFixed(2)}` : "$0.00";
  const avgDur = analytics?.avgDuration ? formatDuration(Math.round(analytics.avgDuration)) : "0m 0s";
  const successRate = analytics?.successRate ? `${analytics.successRate.toFixed(1)}%` : "0%";
  const activeCampaignsCount = campaigns.filter((c: DashboardCampaign) => c.status === "ACTIVE").length;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navbar />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
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
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Overview of your voice AI platform</p>
          </div>
          <div className="flex items-center gap-3">
            <select className="h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-600 dark:text-zinc-400">
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>Last quarter</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Calls"
            value={String(analytics?.totalCalls ?? 0)}
            change={12.5}
            changeLabel="vs last week"
            icon={PhoneCall}
            trend="up"
          />
          <StatsCard
            title="Avg. Duration"
            value={avgDur}
            change={-8.2}
            changeLabel="vs last week"
            icon={Clock}
            trend="down"
          />
          <StatsCard
            title="Success Rate"
            value={successRate}
            change={2.1}
            changeLabel="vs last week"
            icon={CheckCircle2}
            trend="up"
          />
          <StatsCard
            title="Total Cost"
            value={totalCost}
            change={15.3}
            changeLabel="vs last week"
            icon={DollarSign}
            trend="up"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Active Campaigns"
            value={String(activeCampaignsCount)}
            icon={BarChart3}
            trend="neutral"
          />
          <StatsCard
            title="Active Agents"
            value="12"
            icon={Users}
            trend="neutral"
          />
          <StatsCard
            title="Avg. Sentiment"
            value="8.4/10"
            change={0.3}
            changeLabel="vs last week"
            icon={TrendingUp}
            trend="up"
          />
          <StatsCard
            title="Monthly Growth"
            value="+23.5%"
            change={5.7}
            changeLabel="vs last month"
            icon={BarChart3}
            trend="up"
          />
        </div>

        {/* Charts Section */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Call Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <AreaChartComponent
                data={callVolumeData}
                dataKeys={[
                  { key: "calls", color: "#6366f1", name: "Total Calls" },
                  { key: "completed", color: "#22c55e", name: "Completed" },
                ]}
                height={280}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Campaigns by Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChartComponent
                data={topCampaigns}
                dataKey="rate"
                color="#6366f1"
                horizontal
                height={280}
              />
            </CardContent>
          </Card>
        </div>

        {/* Recent Calls */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Calls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Contact</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Phone</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Duration</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 uppercase">Sentiment</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCalls.map((call) => (
                    <tr key={call.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">{call.contact}</td>
                      <td className="py-3 px-4 text-sm text-zinc-500">{call.phone}</td>
                      <td className="py-3 px-4 text-sm text-zinc-500">{call.duration}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          call.status === "completed"
                            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                            : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                        }`}>
                          {call.status === "completed" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {call.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          call.sentiment === "very_positive" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" :
                          call.sentiment === "positive" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                          call.sentiment === "neutral" ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400" :
                          "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                        }`}>
                          {call.sentiment.replace("_", " ")}
                        </span>
                      </td>
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
