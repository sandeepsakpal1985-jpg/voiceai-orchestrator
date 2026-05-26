"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  Users,
  Settings2,
  Plus,
  Trash2,
  Shield,
  Mail,
  UserPlus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  Save,
  Loader2,
} from "lucide-react";

interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  website: string | null;
  timezone: string;
  settings: Record<string, unknown>;
  createdAt: string;
  _count?: { members: number; workspaces: number };
  members?: { role: string }[];
}

interface OrganizationMember {
  id: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  joinedAt: string | null;
  invitedBy: string | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
}

export default function OrganizationSettingsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // New org form
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgDesc, setNewOrgDesc] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Invite member form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviting, setInviting] = useState(false);

  // New workspace form
  const [newWsName, setNewWsName] = useState("");
  const [newWsDesc, setNewWsDesc] = useState("");
  const [creatingWs, setCreatingWs] = useState(false);

  // Edit org form
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editTz, setEditTz] = useState("");

  // ── Fetch organizations ──
  useEffect(() => {
    fetchOrganizations();
  }, []);

  async function fetchOrganizations() {
    setLoading(true);
    try {
      const res = await fetch("/api/organizations");
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.organizations || []);
        if (data.organizations?.length > 0) {
          selectOrganization(data.organizations[0]);
        }
      }
    } catch (err) {
      setError("Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }

  async function selectOrganization(org: Organization) {
    setSelectedOrg(org);
    setEditName(org.name);
    setEditSlug(org.slug);
    setEditDesc(org.description || "");
    setEditWebsite(org.website || "");
    setEditTz(org.timezone || "UTC");

    // Fetch members and workspaces in parallel
    const [membersRes, wsRes] = await Promise.all([
      fetch(`/api/organizations/members?organizationId=${org.id}`),
      fetch(`/api/organizations/workspaces?organizationId=${org.id}`),
    ]);

    if (membersRes.ok) {
      const membersData = await membersRes.json();
      setMembers(membersData.members || []);
    }
    if (wsRes.ok) {
      const wsData = await wsRes.json();
      setWorkspaces(wsData.workspaces || []);
    }
  }

  // ── Create organization ──
  async function createOrganization() {
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newOrgName,
          description: newOrgDesc,
        }),
      });
      if (res.ok) {
        setNewOrgName("");
        setNewOrgDesc("");
        await fetchOrganizations();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create organization");
      }
    } catch {
      setError("Failed to create organization");
    } finally {
      setCreatingOrg(false);
    }
  }

  // ── Update organization ──
  async function updateOrganization() {
    if (!selectedOrg) return;
    setSaving(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedOrg.id,
          name: editName,
          slug: editSlug,
          description: editDesc,
          website: editWebsite,
          timezone: editTz,
        }),
      });
      if (res.ok) {
        await fetchOrganizations();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update organization");
      }
    } catch {
      setError("Failed to update organization");
    } finally {
      setSaving(false);
    }
  }

  // ── Invite member ──
  async function inviteMember() {
    if (!selectedOrg || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch("/api/organizations/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedOrg.id,
          email: inviteEmail,
          role: inviteRole,
        }),
      });
      if (res.ok) {
        setInviteEmail("");
        const membersRes = await fetch(
          `/api/organizations/members?organizationId=${selectedOrg.id}`
        );
        if (membersRes.ok) {
          const data = await membersRes.json();
          setMembers(data.members || []);
        }
      } else {
        const data = await res.json();
        setError(data.error || "Failed to invite member");
      }
    } catch {
      setError("Failed to invite member");
    } finally {
      setInviting(false);
    }
  }

  // ── Remove member ──
  async function removeMember(userId: string) {
    if (!selectedOrg) return;
    try {
      const res = await fetch(
        `/api/organizations/members?organizationId=${selectedOrg.id}&userId=${userId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.user.id !== userId));
      }
    } catch {
      setError("Failed to remove member");
    }
  }

  // ── Create workspace ──
  async function createWorkspace() {
    if (!selectedOrg || !newWsName.trim()) return;
    setCreatingWs(true);
    try {
      const res = await fetch("/api/organizations/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedOrg.id,
          name: newWsName,
          description: newWsDesc,
        }),
      });
      if (res.ok) {
        setNewWsName("");
        setNewWsDesc("");
        const wsRes = await fetch(
          `/api/organizations/workspaces?organizationId=${selectedOrg.id}`
        );
        if (wsRes.ok) {
          const data = await wsRes.json();
          setWorkspaces(data.workspaces || []);
        }
      }
    } catch {
      setError("Failed to create workspace");
    } finally {
      setCreatingWs(false);
    }
  }

  // ── Delete workspace ──
  async function deleteWorkspace(id: string) {
    try {
      const res = await fetch(`/api/organizations/workspaces?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setWorkspaces((prev) => prev.filter((w) => w.id !== id));
      }
    } catch {
      setError("Failed to delete workspace");
    }
  }

  // ── Role badge color ──
  function roleBadgeVariant(role: string) {
    switch (role) {
      case "OWNER":
        return { variant: "default" as const, className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300" };
      case "ADMIN":
        return { variant: "default" as const, className: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" };
      case "MEMBER":
        return { variant: "secondary" as const, className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" };
      default:
        return { variant: "outline" as const, className: "" };
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Organization Settings</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Manage your organizations, teams, and workspaces
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Organization selector + Create new */}
      <div className="flex gap-4 items-start">
        <div className="flex-1">
          {organizations.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No Organizations</CardTitle>
                <CardDescription>
                  Create your first organization to get started with team management.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label>Organization Name</Label>
                    <Input
                      placeholder="Acme Corp"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Description (optional)</Label>
                    <Textarea
                      placeholder="A short description of your organization"
                      value={newOrgDesc}
                      onChange={(e) => setNewOrgDesc(e.target.value)}
                    />
                  </div>
                  <Button onClick={createOrganization} disabled={creatingOrg || !newOrgName.trim()}>
                    {creatingOrg ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Building2 className="h-4 w-4 mr-2" />}
                    Create Organization
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="settings" className="space-y-6">
              {/* Org switcher */}
              <div className="flex items-center gap-2 flex-wrap">
                {organizations.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => selectOrganization(org)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedOrg?.id === org.id
                        ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5 inline mr-1.5" />
                    {org.name}
                    <Badge variant="outline" className="ml-2 text-[10px] px-1.5">
                      {org._count?.members ?? 0}
                    </Badge>
                  </button>
                ))}
                <button
                  onClick={() => window.location.reload()}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 inline mr-1" />
                  New
                </button>
              </div>

              <TabsList>
                <TabsTrigger value="settings">
                  <Settings2 className="h-4 w-4 mr-2" />
                  Settings
                </TabsTrigger>
                <TabsTrigger value="members">
                  <Users className="h-4 w-4 mr-2" />
                  Members ({members.length})
                </TabsTrigger>
                <TabsTrigger value="workspaces">
                  <Layers className="h-4 w-4 mr-2" />
                  Workspaces ({workspaces.length})
                </TabsTrigger>
              </TabsList>

              {/* Settings Tab */}
              <TabsContent value="settings" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">General</CardTitle>
                    <CardDescription>Update your organization's basic information</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Organization Name</Label>
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Slug</Label>
                        <Input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Description</Label>
                        <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Website</Label>
                        <Input value={editWebsite} onChange={(e) => setEditWebsite(e.target.value)} placeholder="https://example.com" />
                      </div>
                      <div className="space-y-2">
                        <Label>Timezone</Label>
                        <Input value={editTz} onChange={(e) => setEditTz(e.target.value)} placeholder="UTC" />
                      </div>
                    </div>
                    <Button onClick={updateOrganization} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      Save Changes
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Members Tab */}
              <TabsContent value="members" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Team Members</CardTitle>
                    <CardDescription>Manage who has access to this organization</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Invite form */}
                      <div className="flex gap-3 items-end">
                        <div className="flex-1 space-y-1">
                          <Label>Email</Label>
                          <Input
                            placeholder="colleague@company.com"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                          />
                        </div>
                        <div className="w-32 space-y-1">
                          <Label>Role</Label>
                          <select
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                          >
                            <option value="MEMBER">Member</option>
                            <option value="ADMIN">Admin</option>
                            <option value="VIEWER">Viewer</option>
                          </select>
                        </div>
                        <Button onClick={inviteMember} disabled={inviting || !inviteEmail.trim()}>
                          {inviting ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <UserPlus className="h-4 w-4 mr-2" />
                          )}
                          Invite
                        </Button>
                      </div>

                      {/* Members list */}
                      <div className="space-y-2">
                        {members.map((member) => {
                          const badgeStyle = roleBadgeVariant(member.role);
                          return (
                            <div
                              key={member.id}
                              className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50"
                            >
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                  {member.user.name?.[0]?.toUpperCase() || member.user.email?.[0]?.toUpperCase() || "?"}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                    {member.user.name || "Unnamed"}
                                  </p>
                                  <p className="text-xs text-zinc-500">{member.user.email}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className={badgeStyle.className}>
                                  {member.role}
                                </Badge>
                                {member.role !== "OWNER" && (
                                  <button
                                    onClick={() => removeMember(member.user.id)}
                                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {members.length === 0 && (
                          <p className="text-sm text-zinc-400 text-center py-4">No members yet</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Workspaces Tab */}
              <TabsContent value="workspaces" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Workspaces</CardTitle>
                    <CardDescription>Organize your work into separate workspaces</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Create workspace */}
                      <div className="flex gap-3 items-end">
                        <div className="flex-1 space-y-1">
                          <Label>Workspace Name</Label>
                          <Input
                            placeholder="Marketing"
                            value={newWsName}
                            onChange={(e) => setNewWsName(e.target.value)}
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <Label>Description (optional)</Label>
                          <Input
                            placeholder="Social media campaigns"
                            value={newWsDesc}
                            onChange={(e) => setNewWsDesc(e.target.value)}
                          />
                        </div>
                        <Button onClick={createWorkspace} disabled={creatingWs || !newWsName.trim()}>
                          {creatingWs ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Plus className="h-4 w-4 mr-2" />
                          )}
                          Create
                        </Button>
                      </div>

                      {/* Workspaces list */}
                      <div className="grid gap-2">
                        {workspaces.map((ws) => (
                          <div
                            key={ws.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                                <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{ws.name}</p>
                                <p className="text-xs text-zinc-500">
                                  {ws.slug} {ws.description ? `· ${ws.description}` : ""}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => deleteWorkspace(ws.id)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        {workspaces.length === 0 && (
                          <p className="text-sm text-zinc-400 text-center py-4">No workspaces yet</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
