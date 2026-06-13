"use client";
import { useState, useEffect } from "react";
import {
  Cable,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Globe,
  Database,
  Loader2,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface Integration {
  id: string;
  name: string;
  integration_type: string;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
}

interface SyncJob {
  id: string;
  status: string;
  docs_processed: number;
  docs_failed: number;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

function ConfluenceForm({ onConfigured }: { onConfigured: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [spaceKey, setSpaceKey] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/integrations/confluence", {
        method: "POST",
        body: JSON.stringify({ name, url, username, api_token: apiToken, space_key: spaceKey || undefined }),
      });
      toast.success(`Connected to Confluence: ${name}`);
      setName(""); setUrl(""); setUsername(""); setApiToken(""); setSpaceKey("");
      onConfigured();
    } catch (err: any) {
      toast.error(err.message || "Failed to configure Confluence");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Integration Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Confluence" required />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Confluence URL</label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://company.atlassian.net/wiki" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Username / Email</label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="user@company.com" required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">API Token</label>
          <Input type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder="••••••••" required />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Space Key (optional — leave empty to sync all spaces)</label>
        <Input value={spaceKey} onChange={(e) => setSpaceKey(e.target.value)} placeholder="KNOW" />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
        {loading ? "Connecting..." : "Test & Configure"}
      </Button>
    </form>
  );
}

function SharePointForm({ onConfigured }: { onConfigured: () => void }) {
  const [name, setName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/integrations/sharepoint", {
        method: "POST",
        body: JSON.stringify({ name, site_url: siteUrl, client_id: clientId, client_secret: clientSecret }),
      });
      toast.success(`Connected to SharePoint: ${name}`);
      setName(""); setSiteUrl(""); setClientId(""); setClientSecret("");
      onConfigured();
    } catch (err: any) {
      toast.error(err.message || "Failed to configure SharePoint");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Integration Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My SharePoint" required />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">SharePoint Site URL</label>
        <Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://company.sharepoint.com/sites/knowledge" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Client ID</label>
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Azure App Client ID" required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Client Secret</label>
          <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="••••••••" required />
        </div>
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
        {loading ? "Connecting..." : "Test & Configure"}
      </Button>
    </form>
  );
}

function IntegrationCard({
  integration,
  onSync,
  onDelete,
  onViewSyncs,
  syncing,
  syncJobs,
}: {
  integration: Integration;
  onSync: (id: string) => void;
  onDelete: (id: string) => void;
  onViewSyncs: (id: string) => void;
  syncing: boolean;
  syncJobs: SyncJob[];
}) {
  const isSyncing = syncing;
  const lastJob = syncJobs[0];

  return (
    <Card key={integration.id} className="hover:bg-accent/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              {integration.integration_type === "confluence" ? (
                <Globe className="h-5 w-5 text-blue-500" />
              ) : (
                <Database className="h-5 w-5 text-green-500" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-sm truncate">{integration.name}</h3>
                <Badge variant={integration.is_active ? "success" : "secondary"} className="text-[10px]">
                  {integration.is_active ? "Active" : "Inactive"}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {integration.integration_type}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {integration.last_sync_at && (
                  <span>Last sync: {formatDate(integration.last_sync_at)}</span>
                )}
                {lastJob && (
                  <span className={lastJob.status === "completed" ? "text-green-600" : lastJob.status === "failed" ? "text-red-600" : ""}>
                    {lastJob.docs_processed} docs synced
                  </span>
                )}
                <span>Created {formatDate(integration.created_at)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSync(integration.id)}
              disabled={isSyncing}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
              Sync
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewSyncs(integration.id)}
            >
              History
            </Button>
            <button
              onClick={() => onDelete(integration.id)}
              className="p-2 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {syncJobs.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Sync History</p>
            {syncJobs.map((job) => (
              <div key={job.id} className="flex items-center gap-3 text-xs">
                {job.status === "completed" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                ) : job.status === "failed" ? (
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                )}
                <span>{job.status}</span>
                <span className="text-muted-foreground">{job.docs_processed} docs</span>
                {job.started_at && <span className="text-muted-foreground">{formatDate(job.started_at)}</span>}
                {job.error && <span className="text-red-500 truncate">{job.error}</span>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncJobs, setSyncJobs] = useState<Record<string, SyncJob[]>>({});

  const fetchIntegrations = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/integrations/");
      setIntegrations(data);

      // Fetch sync history for each integration in parallel
      const jobsMap: Record<string, SyncJob[]> = {};
      const results = await Promise.allSettled(
        (data as Integration[]).map(async (int) => {
          const jobs = await apiFetch(`/integrations/${int.id}/syncs?limit=5`);
          return { id: int.id, jobs };
        })
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          jobsMap[result.value.id] = result.value.jobs;
        }
      }
      setSyncJobs(jobsMap);
    } catch {
      toast.error("Failed to load integrations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchIntegrations(); }, []);

  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      const result = await apiFetch(`/integrations/${id}/sync`, { method: "POST" });
      toast.success(`Sync ${result.status}: ${result.docs_processed} docs processed`);
      await fetchIntegrations();
    } catch (err: any) {
      toast.error(err.message || "Sync failed");
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/integrations/${id}`, { method: "DELETE" });
      toast.success("Integration deactivated");
      await fetchIntegrations();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete integration");
    }
  };

  const handleViewSyncs = async (id: string) => {
    try {
      const jobs = await apiFetch(`/integrations/${id}/syncs?limit=10`);
      setSyncJobs((prev) => ({ ...prev, [id]: jobs }));
    } catch {
      toast.error("Failed to load sync history");
    }
  };

  const confluence = integrations.filter((i) => i.integration_type === "confluence");
  const sharepoint = integrations.filter((i) => i.integration_type === "sharepoint");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Integrations</h2>
          <p className="text-muted-foreground">
            Connect Confluence, SharePoint, and other enterprise knowledge sources
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchIntegrations} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && integrations.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Tabs defaultValue="configure">
          <TabsList>
            <TabsTrigger value="configure">+ Add Integration</TabsTrigger>
            <TabsTrigger value="confluence">
              Confluence {confluence.length > 0 && `(${confluence.length})`}
            </TabsTrigger>
            <TabsTrigger value="sharepoint">
              SharePoint {sharepoint.length > 0 && `(${sharepoint.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="configure" className="mt-4 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-blue-500" />
                    Confluence
                  </CardTitle>
                  <CardDescription>
                    Connect to Atlassian Confluence to sync wiki pages, documentation, and knowledge base articles.
                    Uses the atlassian-python-api library with a user API token.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ConfluenceForm onConfigured={fetchIntegrations} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-green-500" />
                    SharePoint
                  </CardTitle>
                  <CardDescription>
                    Connect to Microsoft SharePoint to sync documents from document libraries.
                    Uses app-only authentication with Azure AD credentials.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SharePointForm onConfigured={fetchIntegrations} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="confluence" className="mt-4 space-y-3">
            {confluence.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Globe className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium">No Confluence integrations configured</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Configure one in the "Add Integration" tab
                  </p>
                </CardContent>
              </Card>
            ) : (
              confluence.map((int) => (
                <IntegrationCard
                  key={int.id}
                  integration={int}
                  onSync={handleSync}
                  onDelete={handleDelete}
                  onViewSyncs={handleViewSyncs}
                  syncing={syncingId === int.id}
                  syncJobs={syncJobs[int.id] || []}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="sharepoint" className="mt-4 space-y-3">
            {sharepoint.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Database className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium">No SharePoint integrations configured</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Configure one in the "Add Integration" tab
                  </p>
                </CardContent>
              </Card>
            ) : (
              sharepoint.map((int) => (
                <IntegrationCard
                  key={int.id}
                  integration={int}
                  onSync={handleSync}
                  onDelete={handleDelete}
                  onViewSyncs={handleViewSyncs}
                  syncing={syncingId === int.id}
                  syncJobs={syncJobs[int.id] || []}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
