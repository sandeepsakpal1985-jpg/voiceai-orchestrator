"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Plus, Save, RotateCcw, Play, History, Loader2 } from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface Prompt {
  id: string;
  name: string;
  category: string;
  content: string;
  isActive: boolean;
  version: number;
  updatedAt: string;
}

const promptCategories = ["General", "Sales", "Support", "Onboarding", "FAQ"];
const availableVariables = ["company", "agent_name", "customer_name", "date", "time", "issue"];

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchPrompts = useCallback(async () => {
    try {
      const res = await fetch("/api/prompts");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const list = data.prompts ?? [];
      setPrompts(list);
    } catch (err) {
      console.error("Failed to load prompts:", err);
      toast.error("Failed to load prompts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/prompts");
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (cancelled) return;
        const list = data.prompts ?? [];
        setPrompts(list);
        if (list.length > 0 && !selectedPrompt) {
          setSelectedPrompt(list[0]);
          setEditorContent(list[0].content);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load prompts:", err);
        toast.error("Failed to load prompts");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Editor content is set inline in the onClick handler — no effect needed for React 19 compliance
  const handleSave = async () => {
    if (!selectedPrompt) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedPrompt.id,
          name: selectedPrompt.name,
          content: editorContent,
          category: selectedPrompt.category,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Prompt saved successfully");
      fetchPrompts();
    } catch {
      toast.error("Failed to save prompt");
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
          <div className="grid grid-cols-4 gap-6">
            <Skeleton className="h-96 col-span-1" />
            <Skeleton className="h-96 col-span-3" />
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
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Prompt Editor</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage AI voice agent conversation prompts</p>
            </div>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Prompt
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Prompts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 mb-4">
                {promptCategories.map((cat) => (
                  <Button key={cat} variant="ghost" size="sm" className="w-full justify-start text-xs">
                    {cat}
                  </Button>
                ))}
              </div>
              {prompts.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center py-4">No prompts yet.</p>
              ) : (
              <div className="space-y-1">
                {prompts.map((prompt) => (
                  <button
                    key={prompt.id}
                    onClick={() => { setSelectedPrompt(prompt); setEditorContent(prompt.content); }}
                    className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${
                      selectedPrompt?.id === prompt.id
                        ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    <div className="font-medium">{prompt.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge size="sm">{prompt.category}</Badge>
                      <span className="text-xs">v{prompt.version}</span>
                    </div>
                  </button>
                ))}
              </div>
              )}
            </CardContent>
          </Card>

          <div className="lg:col-span-3 space-y-6">
            {selectedPrompt ? (
              <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{selectedPrompt.name}</CardTitle>
                    <p className="text-sm text-zinc-500 mt-1">Category: {selectedPrompt.category} · Version {selectedPrompt.version}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Reset
                    </Button>
                    <Button variant="outline" size="sm">
                      <History className="h-4 w-4 mr-1" />
                      History
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                      Save
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="edit">
                  <TabsList className="mb-4">
                    <TabsTrigger value="edit">Edit</TabsTrigger>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                    <TabsTrigger value="variables">Variables</TabsTrigger>
                  </TabsList>
                  <TabsContent value="edit">
                    <Textarea
                      value={editorContent}
                      onChange={(e) => setEditorContent(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                      placeholder="Enter your prompt template..."
                    />
                    <div className="flex items-center gap-2 mt-2 text-xs text-zinc-400 flex-wrap">
                      <span>Available variables: </span>
                      {availableVariables.map((v) => (
                        <Badge key={v} variant="primary" size="sm" className="cursor-pointer font-mono">{`{{${v}}}`}</Badge>
                      ))}
                    </div>
                  </TabsContent>
                  <TabsContent value="preview">
                    <div className="min-h-[200px] p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{editorContent}</p>
                    </div>
                  </TabsContent>
                  <TabsContent value="variables">
                    <div className="space-y-3">
                      {availableVariables.map((v) => (
                        <div key={v} className="flex items-center gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                          <code className="text-sm font-mono text-indigo-600 dark:text-indigo-400">{`{{${v}}}`}</code>
                          <input
                            className="flex-1 h-8 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-sm"
                            placeholder={`Value for ${v}`}
                          />
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Test Prompt</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-2">
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Enter test input</label>
                    <Input placeholder="Type a customer message to test the prompt response..." />
                  </div>
                  <Button>
                    <Play className="h-4 w-4 mr-1" />
                    Run
                  </Button>
                </div>
              </CardContent>
            </Card>
            </>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-zinc-300" />
                  <p className="text-lg font-medium text-zinc-500">No prompt selected</p>
                  <p className="text-sm text-zinc-400 mt-1">Select a prompt from the sidebar or create a new one.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
