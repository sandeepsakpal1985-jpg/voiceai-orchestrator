"use client";
import { useState, useEffect } from "react";
import { BarChart3, MessageSquare, Users, FileText, ThumbsUp, ThumbsDown, TrendingUp, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { analytics as analyticsApi } from "@/lib/api";
import { toast } from "sonner";

const fallbackData = {
  questions_total: 0,
  questions_per_day: 0,
  active_users: 0,
  total_documents: 0,
  thumbs_up: 0,
  thumbs_down: 0,
  search_success_rate: 80,
  period_days: 30,
};

export default function AnalyticsDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(fallbackData);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyticsApi.dashboard();
      setData(result as any);
    } catch (err) {
      setError("Backend unavailable");
      toast.error("Could not load analytics data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const satisfactionRate = data.thumbs_up + data.thumbs_down > 0
    ? Math.round((data.thumbs_up / (data.thumbs_up + data.thumbs_down)) * 100)
    : 0;

  const statsCards = [
    {
      label: "Questions Asked",
      value: data.questions_total,
      sub: `${data.questions_per_day}/day`,
      icon: MessageSquare,
      color: "text-blue-600",
    },
    {
      label: "Active Users",
      value: data.active_users,
      sub: "Current period",
      icon: Users,
      color: "text-green-600",
    },
    {
      label: "Documents",
      value: data.total_documents,
      sub: "Indexed",
      icon: FileText,
      color: "text-purple-600",
    },
    {
      label: "Satisfaction",
      value: `${satisfactionRate}%`,
      sub: `${data.thumbs_up} 👍 · ${data.thumbs_down} 👎`,
      icon: ThumbsUp,
      color: satisfactionRate >= 80 ? "text-green-600" : "text-amber-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Analytics Dashboard</h2>
          <p className="text-muted-foreground">Usage metrics, trends, and insights (last {data.period_days} days)</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-muted rounded w-24" />
                  <div className="h-8 bg-muted rounded w-16" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          statsCards.map((card) => (
            <Card key={card.label}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="text-3xl font-bold mt-1">{card.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                  </div>
                  <card.icon className={`w-10 h-10 ${card.color} opacity-60`} />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Usage Overview</CardTitle>
              <CardDescription>Key metrics at a glance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  { label: "Questions", value: data.questions_total, icon: MessageSquare },
                  { label: "Per Day", value: data.questions_per_day, icon: TrendingUp },
                  { label: "Active Users", value: data.active_users, icon: Users },
                  { label: "Success Rate", value: `${data.search_success_rate}%`, icon: ThumbsUp },
                ].map((item) => (
                  <div key={item.label} className="text-center p-4 rounded-lg bg-muted/50">
                    <item.icon className="h-5 w-5 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold">{item.value}</p>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feedback">
          <Card>
            <CardHeader>
              <CardTitle>User Feedback</CardTitle>
              <CardDescription>Thumbs up/down on AI responses</CardDescription>
            </CardHeader>
            <CardContent>
              {data.thumbs_up + data.thumbs_down > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="flex items-center gap-1"><ThumbsUp className="h-4 w-4 text-green-500" /> Helpful</span>
                        <span className="font-medium">{Math.round((data.thumbs_up / (data.thumbs_up + data.thumbs_down)) * 100)}%</span>
                      </div>
                      <div className="h-3 bg-muted rounded-full">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${(data.thumbs_up / Math.max(data.thumbs_up + data.thumbs_down, 1)) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="flex items-center gap-1"><ThumbsDown className="h-4 w-4 text-red-500" /> Not Helpful</span>
                        <span className="font-medium">{Math.round((data.thumbs_down / (data.thumbs_up + data.thumbs_down)) * 100)}%</span>
                      </div>
                      <div className="h-3 bg-muted rounded-full">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: `${(data.thumbs_down / Math.max(data.thumbs_up + data.thumbs_down, 1)) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground pt-2">
                    <span>👍 {data.thumbs_up} thumbs up</span>
                    <span>👎 {data.thumbs_down} thumbs down</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ThumbsUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No feedback data yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
