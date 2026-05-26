"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bot,
  Plus,

  Mic,
  Brain,
  Volume2,
  Link2,
  Trash2,
  CheckCircle2,
  XCircle,
  Globe,
  MessageSquare,
  Camera,
  MessageCircle,

} from "lucide-react";

interface AgentTool {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
}

interface SocialAccount {
  id: string;
  platform: string;
  accountId: string;
  accountName: string | null;
  enabled: boolean;
}

interface Agent {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  language: string;
  voiceId: string | null;
  sttProvider: string;
  llmProvider: string;
  ttsProvider: string;
  memoryEnabled: boolean;
  memoryType: string;
  toolsEnabled: boolean;
  isActive: boolean;
  socialConnected: boolean;
  tools: AgentTool[];
  socialAccounts: SocialAccount[];
  createdAt: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);


  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/agents");
        const data = await res.json();
        setAgents(data.agents ?? []);
      } catch (err) {
        console.error("Failed to fetch agents", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const createAgent = async () => {
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New AI Agent",
          systemPrompt:
            "You are a friendly and professional AI voice assistant. Keep responses concise and conversational. Ask relevant follow-up questions to understand the caller's needs.",
          language: "en-US",
          sttProvider: "whisper",
          llmProvider: "ollama",
          ttsProvider: "kokoro",
        }),
      });
      const data = await res.json();
      setAgents((prev) => [data.agent, ...prev]);
      setSelectedAgent(data.agent);
    } catch (err) {
      console.error("Failed to create agent", err);
    }
  };

  const updateAgent = async (id: string, updates: Partial<Agent>) => {
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      setAgents((prev) => prev.map((a) => (a.id === id ? data.agent : a)));
      if (selectedAgent?.id === id) setSelectedAgent(data.agent);
    } catch (err) {
      console.error("Failed to update agent", err);
    }
  };

  const deleteAgent = async (id: string) => {
    try {
      await fetch(`/api/agents/${id}`, { method: "DELETE" });
      setAgents((prev) => prev.filter((a) => a.id !== id));
      if (selectedAgent?.id === id) setSelectedAgent(null);
    } catch (err) {
      console.error("Failed to delete agent", err);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-zinc-100 dark:bg-zinc-900 rounded-xl animate-pulse" />
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
            <Bot className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">AI Agents</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Create and configure AI voice agents with custom prompts, tools, and integrations
            </p>
          </div>
        </div>
        <Button onClick={createAgent} className="gap-2">
          <Plus className="h-4 w-4" />
          New Agent
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Agent List */}
        <div className="lg:col-span-1 space-y-3">
          {agents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Bot className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-4" />
                <h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-2">No agents yet</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                  Create your first AI voice agent to get started
                </p>
                <Button onClick={createAgent} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Agent
                </Button>
              </CardContent>
            </Card>
          ) : (
            agents.map((agent) => (
              <Card
                key={agent.id}
                className={`cursor-pointer transition-all hover:border-indigo-300 dark:hover:border-indigo-700 ${
                  selectedAgent?.id === agent.id
                    ? "ring-2 ring-indigo-500 border-indigo-500"
                    : ""
                }`}
                onClick={() => { setSelectedAgent(agent); }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
                          {agent.name}
                        </h3>
                        <p className="text-xs text-zinc-500 truncate max-w-[180px]">
                          {agent.description || "No description"}
                        </p>
                      </div>
                    </div>
                    <Badge variant={agent.isActive ? "default" : "secondary"} className="text-xs">
                      {agent.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Mic className="h-3 w-3" /> {agent.sttProvider}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Brain className="h-3 w-3" /> {agent.llmProvider}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Volume2 className="h-3 w-3" /> {agent.ttsProvider}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Agent Configuration */}
        <div className="lg:col-span-2">
          {!selectedAgent ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Bot className="h-16 w-16 text-zinc-200 dark:text-zinc-700 mb-4" />
                <h3 className="text-lg font-medium text-zinc-500 dark:text-zinc-400">
                  Select or create an agent
                </h3>
                <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
                  Choose an agent from the list or create a new one to configure its settings
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bot className="h-5 w-5 text-indigo-600" />
                    <div>
                      <CardTitle className="text-lg">{selectedAgent.name}</CardTitle>
                      <CardDescription>Configure your AI agent&apos;s behavior, voice, and integrations</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateAgent(selectedAgent.id, { isActive: !selectedAgent.isActive })}
                    >
                      {selectedAgent.isActive ? (
                        <><XCircle className="h-3 w-3 mr-1" /> Deactivate</>
                      ) : (
                        <><CheckCircle2 className="h-3 w-3 mr-1" /> Activate</>
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteAgent(selectedAgent.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs defaultValue="prompt" className="w-full">
                  <TabsList className="w-full justify-start rounded-none border-b border-zinc-200 dark:border-zinc-800 bg-transparent p-0">
                    <TabsTrigger value="prompt" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500">Prompt</TabsTrigger>
                    <TabsTrigger value="voice" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500">Voice</TabsTrigger>
                    <TabsTrigger value="providers" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500">Providers</TabsTrigger>
                    <TabsTrigger value="tools" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500">Tools</TabsTrigger>
                    <TabsTrigger value="social" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500">Social</TabsTrigger>
                    <TabsTrigger value="memory" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-500">Memory</TabsTrigger>
                  </TabsList>

                  {/* Prompt Tab */}
                  <TabsContent value="prompt" className="p-6 space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Agent Name</label>
                      <Input
                        value={selectedAgent.name}
                        onChange={(e) => {
                          const updated = { ...selectedAgent, name: e.target.value };
                          setSelectedAgent(updated);
                        }}
                        onBlur={() => updateAgent(selectedAgent.id, { name: selectedAgent.name })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Description</label>
                      <Input
                        value={selectedAgent.description || ""}
                        onChange={(e) => setSelectedAgent({ ...selectedAgent, description: e.target.value })}
                        onBlur={() => updateAgent(selectedAgent.id, { description: selectedAgent.description })}
                        placeholder="Brief description of this agent's role"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">System Prompt</label>
                      <Textarea
                        value={selectedAgent.systemPrompt}
                        onChange={(e) => setSelectedAgent({ ...selectedAgent, systemPrompt: e.target.value })}
                        onBlur={() => updateAgent(selectedAgent.id, { systemPrompt: selectedAgent.systemPrompt })}
                        className="min-h-[200px] font-mono text-sm"
                      />
                      <p className="text-xs text-zinc-500">
                        This prompt defines the agent&apos;s personality, behavior, and constraints
                      </p>
                    </div>
                  </TabsContent>

                  {/* Voice Tab */}
                  <TabsContent value="voice" className="p-6 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Voice ID</label>
                        <Input
                          value={selectedAgent.voiceId || ""}
                          onChange={(e) => setSelectedAgent({ ...selectedAgent, voiceId: e.target.value })}
                          onBlur={() => updateAgent(selectedAgent.id, { voiceId: selectedAgent.voiceId })}
                          placeholder="21m00Tcm4TlvDq8ikWAM"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Language</label>
                        <Select
                          value={selectedAgent.language}
                          onValueChange={(v) => updateAgent(selectedAgent.id, { language: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en-US">English (US)</SelectItem>
                            <SelectItem value="en-GB">English (UK)</SelectItem>
                            <SelectItem value="es-ES">Spanish</SelectItem>
                            <SelectItem value="fr-FR">French</SelectItem>
                            <SelectItem value="de-DE">German</SelectItem>
                            <SelectItem value="ja-JP">Japanese</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                      <h4 className="text-sm font-medium mb-2">Voice Preview</h4>
                      <p className="text-xs text-zinc-500">
                        Voice configuration is synchronized with the Voice Settings page. Configure voice providers, speaking rate, pitch, and emotion there.
                      </p>
                    </div>
                  </TabsContent>

                  {/* Providers Tab */}
                  <TabsContent value="providers" className="p-6 space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-1.5">
                          <Mic className="h-3 w-3" /> STT Provider
                        </label>
                        <Select
                          value={selectedAgent.sttProvider}
                          onValueChange={(v) => updateAgent(selectedAgent.id, { sttProvider: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="whisper">Whisper (Local) ⭐</SelectItem>
                            <SelectItem value="deepgram">Deepgram (Cloud)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-1.5">
                          <Brain className="h-3 w-3" /> LLM Provider
                        </label>
                        <Select
                          value={selectedAgent.llmProvider}
                          onValueChange={(v) => updateAgent(selectedAgent.id, { llmProvider: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ollama">Ollama (Local) ⭐</SelectItem>
                            <SelectItem value="openai">OpenAI (Cloud)</SelectItem>
                            <SelectItem value="gemini">Gemini (Cloud)</SelectItem>
                            <SelectItem value="openrouter">OpenRouter (Cloud)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-1.5">
                          <Volume2 className="h-3 w-3" /> TTS Provider
                        </label>
                        <Select
                          value={selectedAgent.ttsProvider}
                          onValueChange={(v) => updateAgent(selectedAgent.id, { ttsProvider: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kokoro">Kokoro (Local) ⭐</SelectItem>
                            <SelectItem value="openvoice">OpenVoice (Local)</SelectItem>
                            <SelectItem value="xtts">XTTS (Local)</SelectItem>
                            <SelectItem value="qwen3-tts">Qwen3-TTS (Local)</SelectItem>
                            <SelectItem value="elevenlabs">ElevenLabs (Cloud)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                      <p className="text-xs text-zinc-500">
                        Provider switching happens at runtime. Ensure the corresponding API keys and services are configured in the environment.
                      </p>
                    </div>
                  </TabsContent>

                  {/* Tools Tab */}
                  <TabsContent value="tools" className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">Connected Tools</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Enable tools</span>
                        <Switch
                          checked={selectedAgent.toolsEnabled}
                          onCheckedChange={(v) => updateAgent(selectedAgent.id, { toolsEnabled: v })}
                        />
                      </div>
                    </div>
                    {selectedAgent.tools.length === 0 ? (
                      <div className="p-8 text-center">
                        <Link2 className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                        <p className="text-sm text-zinc-500">No tools configured</p>
                        <p className="text-xs text-zinc-400 mt-1">Add tools to enable function calling, webhooks, and n8n workflows</p>
                        <Button variant="outline" size="sm" className="mt-3 gap-1">
                          <Plus className="h-3 w-3" /> Add Tool
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedAgent.tools.map((tool: AgentTool) => (
                          <div key={tool.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                            <div>
                              <p className="text-sm font-medium">{tool.name}</p>
                              <p className="text-xs text-zinc-500">Type: {tool.type}</p>
                            </div>
                            <Badge variant={tool.enabled ? "default" : "secondary"} className="text-xs">{tool.enabled ? "Active" : "Disabled"}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* Social Tab */}
                  <TabsContent value="social" className="p-6 space-y-4">
                    <h4 className="text-sm font-medium">Connected Social Accounts</h4>
                    {selectedAgent.socialAccounts.length === 0 ? (
                      <div className="p-8 text-center">
                        <Globe className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                        <p className="text-sm text-zinc-500">No social accounts connected</p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Connect Instagram, Facebook Messenger, or WhatsApp to enable automated responses
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedAgent.socialAccounts.map((acct: SocialAccount) => (
                          <div key={acct.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-3">
                              {acct.platform === "instagram" ? (
                                <Camera className="h-4 w-4 text-pink-500" />
                              ) : acct.platform === "facebook" ? (
                                <MessageCircle className="h-4 w-4 text-blue-500" />
                              ) : (
                                <MessageSquare className="h-4 w-4 text-green-500" />
                              )}
                              <div>
                                <p className="text-sm font-medium">{acct.accountName || acct.accountId}</p>
                                <p className="text-xs text-zinc-500 capitalize">{acct.platform}</p>
                              </div>
                            </div>
                            <Badge variant={acct.enabled ? "default" : "secondary"} className="text-xs">
                              {acct.enabled ? "Active" : "Disabled"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* Memory Tab */}
                  <TabsContent value="memory" className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">Memory Settings</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Enable memory</span>
                        <Switch
                          checked={selectedAgent.memoryEnabled}
                          onCheckedChange={(v) => updateAgent(selectedAgent.id, { memoryEnabled: v })}
                        />
                      </div>
                    </div>
                    {selectedAgent.memoryEnabled && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Memory Type</label>
                          <Select
                            value={selectedAgent.memoryType}
                            onValueChange={(v) => updateAgent(selectedAgent.id, { memoryType: v })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="conversation">Conversation History</SelectItem>
                              <SelectItem value="vector">Vector (RAG)</SelectItem>
                              <SelectItem value="both">Both</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                          <p className="text-xs text-zinc-500">
                            Vector memory enables semantic search across past conversations and knowledge base documents. Configure vector storage in the Knowledge Base section.
                          </p>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
