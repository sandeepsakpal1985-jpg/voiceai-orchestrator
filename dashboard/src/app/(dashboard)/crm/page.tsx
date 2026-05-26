"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  LayoutGrid,
  List,
  Plus,
  Users,
  TrendingUp,
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  Search,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  stages: PipelineStage[];
  _count: { leads: number };
}

interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color: string;
  winProbability: number;
}

interface Lead {
  id: string;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  company: string | null;
  score: number;
  status: string;
  source: string | null;
  stageId: string | null;
  stage: PipelineStage | null;
  pipelineId: string | null;
  notes: string | null;
  tags: string[];
  lastContactedAt: string | null;
  createdAt: string;
  activities: Activity[];
}

interface Activity {
  id: string;
  type: string;
  content: string;
  createdAt: string;
}

// ── Drag-and-drop subcomponents ───────────────────────────────────────

function DraggableLeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`${isDragging ? "opacity-30" : ""}`}
    >
      <Card
        className={`cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${isDragging ? "shadow-lg ring-2 ring-indigo-400" : ""}`}
        onClick={() => { if (!isDragging) onClick(); }}
      >
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{lead.contactName}</p>
              {lead.company && (
                <p className="text-xs text-zinc-500 truncate">{lead.company}</p>
              )}
            </div>
            <span className={`text-xs font-bold ml-2 ${getScoreColor(lead.score)}`}>
              {lead.score}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {lead.tags.slice(0, 2).map((tag, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">{tag}</Badge>
            ))}
            {lead.source && (
              <Badge variant="secondary" className="text-[10px] capitalize">{lead.source}</Badge>
            )}
          </div>
          <div className="flex gap-1.5 text-[10px] text-zinc-400">
            {lead.lastContactedAt && (
              <span>Last: {new Date(lead.lastContactedAt).toLocaleDateString()}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DroppableStageColumn({ stage, children }: { stage: PipelineStage; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 transition-colors ${isOver ? "bg-indigo-50 dark:bg-indigo-900/10 rounded-lg" : ""}`}
    >
      {children}
    </div>
  );
}

const getScoreColor = (score: number) =>
  score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-zinc-400";

export default function CRMPage() {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [showNewLead, setShowNewLead] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [newLead, setNewLead] = useState({ contactName: "", contactPhone: "", contactEmail: "", company: "", source: "manual" });
  const [newActivity, setNewActivity] = useState({ type: "note", content: "" });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/crm/pipelines");
        const data = await res.json();
        setPipelines(data.pipelines ?? []);
      } catch { /* ignore */ }
    })();
    (async () => {
      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        const res = await fetch(`/api/crm/leads?${params}`);
        const data = await res.json();
        setLeads(data.leads ?? []);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        const res = await fetch(`/api/crm/leads?${params}`);
        const data = await res.json();
        setLeads(data.leads ?? []);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const createLead = async () => {
    if (!newLead.contactName) return;
    const pipeline = pipelines[0];
    try {
      await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newLead, pipelineId: pipeline?.id }),
      });
      setNewLead({ contactName: "", contactPhone: "", contactEmail: "", company: "", source: "manual" });
      setShowNewLead(false);
      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        const res = await fetch(`/api/crm/leads?${params}`);
        const data = await res.json();
        setLeads(data.leads ?? []);
      } catch { /* ignore */ }
    } catch (err) { console.error(err); }
  };



  const addActivity = async () => {
    if (!selectedLead || !newActivity.content) return;
    try {
      await fetch(`/api/crm/leads/${selectedLead.id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newActivity),
      });
      setNewActivity({ type: "note", content: "" });
      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        const res = await fetch(`/api/crm/leads?${params}`);
        const data = await res.json();
        setLeads(data.leads ?? []);
      } catch { /* ignore */ }
    } catch (err) { console.error(err); }
  };

  const [activeDragLead, setActiveDragLead] = useState<Lead | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const leadId = event.active.id as string;
    const lead = leads.find((l) => l.id === leadId);
    if (lead) setActiveDragLead(lead);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragLead(null);

    if (!over || active.id === over.id) return;

    const leadId = active.id as string;
    const newStageId = over.id as string;

    try {
      await fetch("/api/crm/leads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: leadId, stageId: newStageId }),
      });
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/crm/leads?${params}`);
      const data = await res.json();
      setLeads(data.leads ?? []);
    } catch (err) {
      console.error("Failed to move lead:", err);
    }
  };

  const getStageLeads = (stageId: string) => leads.filter((l) => l.stageId === stageId);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
            <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">CRM</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Manage leads, pipelines, and customer relationships
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5">
            <Button
              variant={view === "kanban" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("kanban")}
              className="h-8"
            >
              <LayoutGrid className="h-3.5 w-3.5 mr-1" /> Kanban
            </Button>
            <Button
              variant={view === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("list")}
              className="h-8"
            >
              <List className="h-3.5 w-3.5 mr-1" /> List
            </Button>
          </div>
          <Button onClick={() => setShowNewLead(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Add Lead
          </Button>
        </div>
      </div>

      {/* Search & Stats */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-4 text-sm text-zinc-500">
          <span>{leads.length} total leads</span>
          <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            {leads.filter((l) => l.status === "won").length} won
          </span>
        </div>
      </div>

      {/* Kanban View */}
      {view === "kanban" && pipelines.length > 0 && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "60vh" }}>
            {pipelines[0].stages.map((stage) => {
              const stageLeads = getStageLeads(stage.id);
              return (
                <DroppableStageColumn key={stage.id} stage={stage}>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
                      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{stage.name}</h3>
                      <Badge variant="secondary" className="text-xs ml-1">{stageLeads.length}</Badge>
                    </div>
                    <span className="text-[10px] text-zinc-400">{stage.winProbability}%</span>
                  </div>
                  <div className="space-y-2 min-h-[200px] p-2 rounded-lg transition-colors">
                    {stageLeads.map((lead) => (
                      <DraggableLeadCard
                        key={lead.id}
                        lead={lead}
                        onClick={() => setSelectedLead(lead)}
                      />
                    ))}
                    {stageLeads.length === 0 && (
                      <div className="p-4 text-center text-xs text-zinc-400 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
                        Drop leads here
                      </div>
                    )}
                  </div>
                </DroppableStageColumn>
              );
            })}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDragLead ? (
              <div className="w-72 opacity-90 rotate-3 shadow-2xl">
                <Card className="ring-2 ring-indigo-400">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{activeDragLead.contactName}</p>
                        {activeDragLead.company && (
                          <p className="text-xs text-zinc-500 truncate">{activeDragLead.company}</p>
                        )}
                      </div>
                      <span className={`text-xs font-bold ml-2 ${getScoreColor(activeDragLead.score)}`}>
                        {activeDragLead.score}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* List View */}
      {view === "list" && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="text-left text-xs font-medium text-zinc-500 p-3">Name</th>
                  <th className="text-left text-xs font-medium text-zinc-500 p-3">Company</th>
                  <th className="text-left text-xs font-medium text-zinc-500 p-3">Stage</th>
                  <th className="text-left text-xs font-medium text-zinc-500 p-3">Score</th>
                  <th className="text-left text-xs font-medium text-zinc-500 p-3">Status</th>
                  <th className="text-left text-xs font-medium text-zinc-500 p-3">Source</th>
                  <th className="text-left text-xs font-medium text-zinc-500 p-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-zinc-100 dark:border-zinc-800/50 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                    onClick={() => setSelectedLead(lead)}
                  >
                    <td className="p-3 text-sm font-medium">{lead.contactName}</td>
                    <td className="p-3 text-sm text-zinc-500">{lead.company || "-"}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">{lead.stage?.name || "Unassigned"}</Badge>
                    </td>
                    <td className={`p-3 text-sm font-bold ${getScoreColor(lead.score)}`}>{lead.score}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className="text-xs capitalize">{lead.status}</Badge>
                    </td>
                    <td className="p-3 text-sm text-zinc-500 capitalize">{lead.source || "manual"}</td>
                    <td className="p-3 text-sm text-zinc-400">{new Date(lead.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-sm text-zinc-500">No leads found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* New Lead Dialog */}
      <Dialog open={showNewLead} onOpenChange={setShowNewLead}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
            <DialogDescription>Create a new lead in your CRM pipeline</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Contact Name *"
              value={newLead.contactName}
              onChange={(e) => setNewLead({ ...newLead, contactName: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Phone"
                value={newLead.contactPhone}
                onChange={(e) => setNewLead({ ...newLead, contactPhone: e.target.value })}
              />
              <Input
                placeholder="Email"
                value={newLead.contactEmail}
                onChange={(e) => setNewLead({ ...newLead, contactEmail: e.target.value })}
              />
            </div>
            <Input
              placeholder="Company"
              value={newLead.company}
              onChange={(e) => setNewLead({ ...newLead, company: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewLead(false)}>Cancel</Button>
            <Button onClick={createLead}>Create Lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Detail Dialog */}
      <Dialog open={!!selectedLead} onOpenChange={(o) => { if (!o) setSelectedLead(null); }}>
        {selectedLead && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedLead.contactName}
                <Badge variant="outline" className="text-xs capitalize">{selectedLead.status}</Badge>
              </DialogTitle>
              <DialogDescription>
                {selectedLead.company && <span>{selectedLead.company} · </span>}
                Score: {selectedLead.score} · Stage: {selectedLead.stage?.name}
              </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="details">
              <TabsList className="w-full">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="activity">Activity Log</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="space-y-3 pt-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-zinc-500">Phone</span>
                    <p className="font-medium">{selectedLead.contactPhone || "-"}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Email</span>
                    <p className="font-medium">{selectedLead.contactEmail || "-"}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Source</span>
                    <p className="font-medium capitalize">{selectedLead.source || "manual"}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Created</span>
                    <p className="font-medium">{new Date(selectedLead.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {selectedLead.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {selectedLead.tags.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
                {selectedLead.notes && (
                  <div>
                    <span className="text-xs text-zinc-500">Notes</span>
                    <p className="text-sm mt-1">{selectedLead.notes}</p>
                  </div>
                )}
                <div className="flex gap-2">
                  {selectedLead.contactPhone && (
                    <Button variant="outline" size="sm" className="gap-1"><Phone className="h-3 w-3" /> Call</Button>
                  )}
                  {selectedLead.contactEmail && (
                    <Button variant="outline" size="sm" className="gap-1"><Mail className="h-3 w-3" /> Email</Button>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="activity" className="space-y-3 pt-4">
                <div className="flex gap-2">
                  <select
                    className="text-xs border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 bg-transparent"
                    value={newActivity.type}
                    onChange={(e) => setNewActivity({ ...newActivity, type: e.target.value })}
                  >
                    <option value="note">Note</option>
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="meeting">Meeting</option>
                    <option value="sms">SMS</option>
                    <option value="social">Social</option>
                  </select>
                  <Input
                    placeholder="Log activity..."
                    value={newActivity.content}
                    onChange={(e) => setNewActivity({ ...newActivity, content: e.target.value })}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={addActivity}><Plus className="h-3 w-3" /></Button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {selectedLead.activities.map((act) => (
                    <div key={act.id} className="flex gap-2 p-2 rounded bg-zinc-50 dark:bg-zinc-800/30">
                      {act.type === "call" ? <Phone className="h-3.5 w-3.5 text-green-500 mt-0.5" /> :
                       act.type === "email" ? <Mail className="h-3.5 w-3.5 text-blue-500 mt-0.5" /> :
                       act.type === "meeting" ? <Calendar className="h-3.5 w-3.5 text-purple-500 mt-0.5" /> :
                       act.type === "social" ? <MessageSquare className="h-3.5 w-3.5 text-pink-500 mt-0.5" /> :
                       <div className="h-3.5 w-3.5 rounded-full bg-zinc-300 mt-0.5" />}
                      <div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">{act.content}</p>
                        <p className="text-[10px] text-zinc-400">{new Date(act.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                  {selectedLead.activities.length === 0 && (
                    <p className="text-xs text-zinc-400 text-center py-4">No activities logged yet</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
