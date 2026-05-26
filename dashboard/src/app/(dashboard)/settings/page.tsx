"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Settings, User, Bell, Shield, Key, Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function SettingsPage() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  interface ApiKey {
    id: string;
    name: string;
    key: string;
    createdAt: string;
    lastUsed?: string;
    active: boolean;
  }

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    companyName: "",
    phone: "",
    timezone: "UTC-5 (Eastern Time)",
  });

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        const user = data.user ?? {};
        setApiKeys(data.apiKeys ?? []);
        setProfile({
          name: user.name ?? "",
          email: user.email ?? "",
          companyName: user.companyName ?? "",
          phone: user.phone ?? "",
          timezone: user.timezone ?? "UTC-5 (Eastern Time)",
        });
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Profile updated successfully");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navbar />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Settings</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage your account and preferences</p>
          </div>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="profile">
              <User className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="h-4 w-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="h-4 w-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="api">
              <Key className="h-4 w-4 mr-2" />
              API Keys
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={profile.email} disabled className="opacity-60" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <Input id="company" value={profile.companyName} onChange={(e) => setProfile({ ...profile, companyName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <select className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"
                    value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}>
                    <option>UTC-8 (Pacific Time)</option>
                    <option>UTC-5 (Eastern Time)</option>
                    <option>UTC+0 (GMT)</option>
                    <option>UTC+1 (CET)</option>
                    <option>UTC+8 (Asia/Singapore)</option>
                  </select>
                </div>
                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {[
                  { title: "Call Alerts", description: "Get notified when call success rate drops below 80%", default: true },
                  { title: "Usage Reports", description: "Receive weekly usage and cost reports", default: true },
                  { title: "Campaign Updates", description: "Notifications when campaigns complete or error", default: true },
                  { title: "Billing Alerts", description: "Payment failures and invoice reminders", default: true },
                  { title: "System Updates", description: "Product updates, maintenance, and new features", default: false },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{item.title}</p>
                      <p className="text-sm text-zinc-500">{item.description}</p>
                    </div>
                    <Switch defaultChecked={item.default} />
                  </div>
                ))}
                <Separator />
                <div className="space-y-2">
                  <Label>Notification Email</Label>
                  <Input defaultValue={profile.email} />
                </div>
                <Button>Save Preferences</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input id="current-password" type="password" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input id="new-password" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input id="confirm-password" type="password" />
                  </div>
                </div>
                <Button>Update Password</Button>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">Two-Factor Authentication</p>
                    <p className="text-sm text-zinc-500">Add an extra layer of security to your account</p>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">Session Timeout</p>
                    <p className="text-sm text-zinc-500">Automatically log out after 30 minutes of inactivity</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>API Keys</CardTitle>
                  <Button size="sm">Generate New Key</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {apiKeys.length === 0 ? (
                  <p className="text-center py-8 text-sm text-zinc-400">No API keys yet. Generate your first key to get started.</p>
                ) : (
                  apiKeys.map((apiKey: ApiKey, i: number) => (
                    <div key={apiKey.id ?? i} className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{apiKey.name}</p>
                          <p className="text-xs text-zinc-400">Created {new Date(apiKey.createdAt).toLocaleDateString()} · Last used {apiKey.lastUsed ? new Date(apiKey.lastUsed).toLocaleDateString() : "Never"}</p>
                        </div>
                        <Badge variant={apiKey.active ? "success" : "default"}>{apiKey.active ? "Active" : "Inactive"}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <code className="flex-1 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 font-mono text-xs">
                          {showApiKey ? apiKey.key : (apiKey.key?.slice(0, 12) ?? "••••••••••••") + "••••••••••••"}
                        </code>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowApiKey(!showApiKey)}>
                          {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { navigator.clipboard.writeText(apiKey.key); toast.success("Copied to clipboard"); }}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
