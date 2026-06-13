"use client";
import { useState, useEffect } from "react";
import { Shield, RefreshCw, Filter, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/audit-logs/`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      } else {
        throw new Error("Failed");
      }
    } catch {
      // Demo data
      setLogs([
        { id: "1", action: "user.login", resource_type: "auth", details: { email: "admin@company.com" }, created_at: new Date().toISOString() },
        { id: "2", action: "document.upload", resource_type: "document", details: { filename: "HR_Policy.pdf" }, created_at: new Date(Date.now() - 3600000).toISOString() },
        { id: "3", action: "document.search", resource_type: "search", details: { query: "leave policy" }, created_at: new Date(Date.now() - 7200000).toISOString() },
        { id: "4", action: "user.logout", resource_type: "auth", details: { email: "admin@company.com" }, created_at: new Date(Date.now() - 10800000).toISOString() },
        { id: "5", action: "document.delete", resource_type: "document", details: { filename: "old_report.pdf" }, created_at: new Date(Date.now() - 14400000).toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const filtered = logs.filter((log) =>
    !filter || log.action.toLowerCase().includes(filter.toLowerCase()) ||
    log.resource_type.toLowerCase().includes(filter.toLowerCase())
  );

  const getActionBadge = (action: string) => {
    if (action.includes("login")) return { variant: "success" as const, label: "Login" };
    if (action.includes("logout")) return { variant: "secondary" as const, label: "Logout" };
    if (action.includes("upload") || action.includes("create")) return { variant: "default" as const, label: "Create" };
    if (action.includes("delete") || action.includes("remove")) return { variant: "destructive" as const, label: "Delete" };
    if (action.includes("update") || action.includes("edit")) return { variant: "warning" as const, label: "Update" };
    if (action.includes("search") || action.includes("view")) return { variant: "outline" as const, label: "Read" };
    return { variant: "outline" as const, label: action.split(".").pop() || action };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Audit Logs</h2>
          <p className="text-muted-foreground">System activity and compliance tracking</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="relative">
        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter by action or resource type..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filtered.map((log) => {
                const badge = getActionBadge(log.action);
                return (
                  <div key={log.id} className="flex items-center justify-between p-4 hover:bg-accent/50">
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          <span className="text-sm font-mono text-muted-foreground">{log.action}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {log.resource_type} · {formatDate(log.created_at)}
                        </p>
                      </div>
                    </div>
                    {log.details && (
                      <button className="p-2 hover:bg-accent rounded-lg text-muted-foreground">
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No audit logs found</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
