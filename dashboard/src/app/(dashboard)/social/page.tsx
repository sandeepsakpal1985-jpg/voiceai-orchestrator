"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Globe,
  Camera,
  MessageCircle,
  MessageSquare,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";

interface SocialConnection {
  id: string;
  platform: string;
  accountId: string;
  accountName: string | null;
  autoReply: boolean;
  welcomeMessage: string | null;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
}

export default function SocialPage() {
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState(false);
  const [newConnection, setNewConnection] = useState({
    platform: "instagram",
    accountId: "",
    accountName: "",
    autoReply: false,
    welcomeMessage: "",
  });

  const fetchConnections = async () => {
    try {
      const res = await fetch("/api/social/connections");
      const data = await res.json();
      setConnections(data.connections ?? []);
    } catch (err) {
      console.error("Failed to fetch connections", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConnections(); }, []);

  const connectAccount = async () => {
    if (!newConnection.accountId) return;
    try {
      const res = await fetch("/api/social/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConnection),
      });
      const data = await res.json();
      setConnections((prev) => [data.connection, ...prev]);
      setNewConnection({ platform: "instagram", accountId: "", accountName: "", autoReply: false, welcomeMessage: "" });
      setShowConnect(false);
    } catch (err) {
      console.error("Failed to connect account", err);
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "instagram": return <Camera className="h-5 w-5 text-pink-500" />;
      case "facebook": return <MessageCircle className="h-5 w-5 text-blue-500" />;
      case "whatsapp": return <MessageSquare className="h-5 w-5 text-green-500" />;
      default: return <Globe className="h-5 w-5 text-zinc-500" />;
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-zinc-100 dark:bg-zinc-900 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
            <Globe className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Social Automation</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Connect Instagram, Facebook Messenger, and WhatsApp for automated lead capture and responses
            </p>
          </div>
        </div>
        <Button onClick={() => setShowConnect(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Connect Account
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Connected Accounts */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Connected Accounts</h2>
          {connections.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Globe className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-4" />
                <h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-2">No accounts connected</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                  Connect your social media accounts to enable automated lead capture and AI responses
                </p>
                <Button onClick={() => setShowConnect(true)} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Connect Your First Account
                </Button>
              </CardContent>
            </Card>
          ) : (
            connections.map((conn) => (
              <Card key={conn.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {getPlatformIcon(conn.platform)}
                      <div>
                        <h3 className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
                          {conn.accountName || conn.accountId}
                        </h3>
                        <p className="text-xs text-zinc-500 capitalize">{conn.platform}</p>
                      </div>
                    </div>
                    <Badge variant={conn.status === "connected" ? "default" : "secondary"} className="text-xs">
                      {conn.status === "connected" ? (
                        <><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</>
                      ) : (
                        <><XCircle className="h-3 w-3 mr-1" /> {conn.status}</>
                      )}
                    </Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      <div className="flex items-center gap-1.5">
                        <span>Auto-reply:</span>
                        <Switch checked={conn.autoReply} />
                      </div>
                      {conn.lastSyncAt && (
                        <span>Last synced: {new Date(conn.lastSyncAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm"><RefreshCw className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="text-red-500"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Info Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Platforms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-950/20 dark:to-purple-950/20">
                <Camera className="h-8 w-8 text-pink-500" />
                <div>
                  <p className="text-sm font-medium">Instagram</p>
                  <p className="text-xs text-zinc-500">DM automation, comment replies, lead capture</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                <MessageCircle className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Facebook Messenger</p>
                  <p className="text-xs text-zinc-500">Automated responses, lead forms, page bots</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                <MessageSquare className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm font-medium">WhatsApp</p>
                  <p className="text-xs text-zinc-500">Business API, templates, automated replies</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Automation Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Auto-reply to DMs</span>
                <Switch checked={false} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Comment auto-reply</span>
                <Switch checked={false} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Lead capture from messages</span>
                <Switch checked={true} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">CRM sync</span>
                <Switch checked={true} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Connect Dialog */}
      <Dialog open={showConnect} onOpenChange={setShowConnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Social Account</DialogTitle>
            <DialogDescription>
              Connect your social media account to enable AI-powered automation
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Platform</label>
              <div className="flex gap-2">
                {[
                  { id: "instagram", label: "Instagram", icon: <Camera className="h-4 w-4" /> },
                  { id: "facebook", label: "Facebook", icon: <MessageCircle className="h-4 w-4" /> },
                  { id: "whatsapp", label: "WhatsApp", icon: <MessageSquare className="h-4 w-4" /> },
                ].map((p) => (
                  <Button
                    key={p.id}
                    variant={newConnection.platform === p.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewConnection({ ...newConnection, platform: p.id })}
                    className="gap-1.5"
                  >
                    {p.icon} {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <Input
              placeholder="Account ID / Username"
              value={newConnection.accountId}
              onChange={(e) => setNewConnection({ ...newConnection, accountId: e.target.value })}
            />
            <Input
              placeholder="Account Name (optional)"
              value={newConnection.accountName}
              onChange={(e) => setNewConnection({ ...newConnection, accountName: e.target.value })}
            />
            <div className="flex items-center justify-between">
              <span className="text-sm">Enable auto-reply</span>
              <Switch
                checked={newConnection.autoReply}
                onCheckedChange={(v) => setNewConnection({ ...newConnection, autoReply: v })}
              />
            </div>
            {newConnection.autoReply && (
              <Textarea
                placeholder="Welcome message (sent to new conversations)"
                value={newConnection.welcomeMessage}
                onChange={(e) => setNewConnection({ ...newConnection, welcomeMessage: e.target.value })}
                className="min-h-[80px]"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConnect(false)}>Cancel</Button>
            <Button onClick={connectAccount}>Connect Account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
