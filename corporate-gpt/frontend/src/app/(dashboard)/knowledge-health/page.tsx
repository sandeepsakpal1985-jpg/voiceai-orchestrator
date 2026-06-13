"use client";
import { useState, useEffect } from "react";
import {
  HeartPulse,
  FileText,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Search,
  RefreshCw,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { knowledgeHealth as healthApi } from "@/lib/api";
import { toast } from "sonner";

// Fallback data when backend is unavailable
const fallbackData = {
  score: 0,
  total_documents: 0,
  indexed_documents: 0,
  open_gaps: 0,
  outdated_documents: 0,
  low_confidence_responses: 0,
};

const fallbackGaps = { total_gaps: 0, top_gaps: [] };

function getScoreColor(score: number) {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  return "text-red-500";
}

function getScoreLabel(score: number) {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Needs Attention";
  return "Critical";
}

export default function KnowledgeHealthPage() {
  const [loading, setLoading] = useState(true);
  const [healthData, setHealthData] = useState(fallbackData);
  const [gapData, setGapData] = useState(fallbackGaps);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [health, gaps] = await Promise.all([
        healthApi.score(),
        healthApi.gaps(),
      ]);
      setHealthData(health);
      setGapData(gaps);
    } catch (err) {
      setError("Unable to reach backend. Using cached data if available.");
      toast.error("Backend unavailable — showing cached health data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Knowledge Health Dashboard</h2>
          <p className="text-muted-foreground">
            Monitor and improve your knowledge base health
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
          {error}
        </div>
      )}

      {/* Health Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-1 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-6 text-center">
            <div className={`text-5xl font-bold ${getScoreColor(healthData.score)}`}>
              {healthData.score}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Overall Health Score</div>
            <Badge
              variant={healthData.score >= 80 ? "success" : healthData.score >= 60 ? "warning" : "destructive"}
              className="mt-2"
            >
              {getScoreLabel(healthData.score)}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Documents</p>
                <p className="text-2xl font-bold">{healthData.total_documents}</p>
              </div>
              <FileText className="h-8 w-8 text-primary/40" />
            </div>
            <div className="mt-2 flex items-center text-xs text-green-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              {healthData.indexed_documents} indexed ({healthData.total_documents > 0
                ? Math.round(healthData.indexed_documents / healthData.total_documents * 100)
                : 0}%)
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Knowledge Gaps</p>
                <p className="text-2xl font-bold text-yellow-500">{healthData.open_gaps}</p>
              </div>
              <Search className="h-8 w-8 text-yellow-500/40" />
            </div>
            <div className="mt-2 flex items-center text-xs text-yellow-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              Unanswered queries
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Outdated</p>
                <p className="text-2xl font-bold text-red-500">{healthData.outdated_documents}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500/40" />
            </div>
            <div className="mt-2 flex items-center text-xs text-red-600">
              <TrendingDown className="h-3 w-3 mr-1" />
              Need review
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="gaps">Knowledge Gaps ({gapData.total_gaps})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Health Score Breakdown</CardTitle>
              <CardDescription>Factors affecting the overall knowledge health score</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  {
                    label: "Document Indexing",
                    value: healthData.total_documents > 0
                      ? Math.round(healthData.indexed_documents / healthData.total_documents * 100)
                      : 0,
                    detail: `${healthData.indexed_documents}/${healthData.total_documents} indexed`,
                  },
                  {
                    label: "Outdated Documents",
                    value: healthData.total_documents > 0
                      ? Math.round((1 - healthData.outdated_documents / healthData.total_documents) * 100)
                      : 100,
                    detail: `${healthData.outdated_documents} need review`,
                  },
                  {
                    label: "Knowledge Coverage",
                    value: healthData.total_documents > 0
                      ? Math.round((1 - (healthData.open_gaps * 3) / Math.max(healthData.total_documents, 1)) * 100)
                      : 0,
                    detail: `${healthData.open_gaps} gaps detected`,
                  },
                  {
                    label: "Response Confidence",
                    value: 100 - Math.min(healthData.low_confidence_responses * 2, 100),
                    detail: `${healthData.low_confidence_responses} low-confidence responses`,
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{item.label}</span>
                      <span className={item.value >= 80 ? "text-green-600" : item.value >= 60 ? "text-yellow-600" : "text-red-600"}>
                        {item.value}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full">
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.value >= 80 ? "bg-green-500" : item.value >= 60 ? "bg-yellow-500" : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(item.value, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gaps">
          <Card>
            <CardHeader>
              <CardTitle>Knowledge Gaps</CardTitle>
              <CardDescription>
                {gapData.total_gaps > 0
                  ? "Frequently asked but unanswered questions"
                  : "No knowledge gaps detected. Great job!"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {gapData.total_gaps > 0 ? (
                <div className="space-y-3">
                  {gapData.top_gaps.map((gap: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{gap.query}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {gap.department_id && (
                            <Badge variant="secondary" className="text-[10px]">
                              {gap.department_id}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Asked {gap.frequency} times
                          </span>
                        </div>
                      </div>
                      <Badge
                        variant={gap.frequency >= 10 ? "destructive" : gap.frequency >= 5 ? "warning" : "secondary"}
                        className="ml-4"
                      >
                        {gap.frequency >= 10 ? "high" : gap.frequency >= 5 ? "medium" : "low"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No knowledge gaps detected</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
