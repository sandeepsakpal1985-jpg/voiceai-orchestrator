"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VoiceChatWidget } from "@/components/voice/voice-chat-widget";
import type { TransportMode } from "@/components/voice/voice-chat-widget";
import Navbar from "@/components/dashboard/navbar";
import {
  PhoneCall,
  Bot,
  Settings2,
  Info,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Cpu,
  Radio,
  Wifi,
  MicVocal,
  MessageSquare,
} from "lucide-react";

const AVAILABLE_VOICES = [
  { id: "rachel", name: "Rachel (ElevenLabs)", provider: "elevenlabs" },
  { id: "domi", name: "Domi (ElevenLabs)", provider: "elevenlabs" },
  { id: "bella", name: "Bella (ElevenLabs)", provider: "elevenlabs" },
  { id: "josh", name: "Josh (ElevenLabs)", provider: "elevenlabs" },
  { id: "local-default", name: "Default (XTTS/Kokoro)", provider: "local" },
];

const DEFAULT_SYSTEM_PROMPT =
  "You are a friendly and professional AI voice assistant. " +
  "Keep responses concise, conversational, and natural. " +
  "Avoid markdown formatting. Speak as if in a phone conversation.";

export default function VoiceChatPage() {
  const [wsStatus, setWsStatus] = useState<string>("idle");
  const [transport, setTransport] = useState<TransportMode>("websocket");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [selectedVoice, setSelectedVoice] = useState(AVAILABLE_VOICES[0].id);
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  const statusBadge = () => {
    switch (wsStatus) {
      case "connected":
        return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</Badge>;
      case "connecting":
        return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><AlertTriangle className="h-3 w-3 mr-1" /> Connecting</Badge>;
      case "error":
        return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"><XCircle className="h-3 w-3 mr-1" /> Error</Badge>;
      default:
        return <Badge variant="outline"><Cpu className="h-3 w-3 mr-1" /> Idle</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
              <PhoneCall className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Voice Chat</h1>
                {statusBadge()}
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Test your AI voice agent with browser-based voice conversations
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Voice Chat Widget */}
          <div className="lg:col-span-2">
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-indigo-600" />
                    <CardTitle className="text-base">AI Voice Agent</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      STT: Whisper
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      LLM: Ollama
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      TTS: Kokoro
                    </Badge>
                  </div>
                </div>
                <CardDescription>
                  Speak naturally — the agent will transcribe, understand, and respond in real-time
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 p-0">
                <VoiceChatWidget
                  transport={transport}
                  systemPrompt={systemPrompt}
                  voiceId={selectedVoice}
                  onStatusChange={(s) => setWsStatus(s)}
                />
              </CardContent>
            </Card>
          </div>

          {/* Info Panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-indigo-600" />
                  <CardTitle className="text-sm">How It Works</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
                <div className="flex gap-3">
                  <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-indigo-600">1</span>
                  </div>
                  <p>Click <strong>Start Call</strong> to begin. Your browser will request microphone access.</p>
                </div>
                <div className="flex gap-3">
                  <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-indigo-600">2</span>
                  </div>
                  <p>Speak naturally — audio is streamed to the orchestrator for STT transcription.</p>
                </div>
                <div className="flex gap-3">
                  <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-indigo-600">3</span>
                  </div>
                  <p>The LLM generates a response, which is then converted to speech via TTS.</p>
                </div>
                <div className="flex gap-3">
                  <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-indigo-600">4</span>
                  </div>
                  <p>Click <strong>End Call</strong> to stop. A conversation summary will be generated.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-zinc-500" />
                  <CardTitle className="text-sm">Pipeline Status</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Transport</span>
                  <div className="flex items-center gap-2">
                    <label htmlFor="transport-switch" className="flex items-center gap-1.5 cursor-pointer">
                      <Wifi className={`h-3.5 w-3.5 ${transport === 'websocket' ? 'text-indigo-600' : 'text-zinc-400'}`} />
                      <span className={`text-xs ${transport === 'websocket' ? 'text-zinc-700 dark:text-zinc-300 font-medium' : 'text-zinc-400'}`}>WS</span>
                    </label>
                    <Switch
                      id="transport-switch"
                      checked={transport === 'livekit'}
                      onCheckedChange={(checked) => setTransport(checked ? 'livekit' : 'websocket')}
                      disabled={wsStatus === 'connected' || wsStatus === 'connecting'}
                    />
                    <label htmlFor="transport-switch" className="flex items-center gap-1.5 cursor-pointer">
                      <Radio className={`h-3.5 w-3.5 ${transport === 'livekit' ? 'text-indigo-600' : 'text-zinc-400'}`} />
                      <span className={`text-xs ${transport === 'livekit' ? 'text-zinc-700 dark:text-zinc-300 font-medium' : 'text-zinc-400'}`}>LiveKit</span>
                    </label>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Connection</span>
                  <span className={`flex items-center gap-1.5 font-medium ${
                    wsStatus === "connected" ? "text-emerald-600" :
                    wsStatus === "connecting" ? "text-amber-600" :
                    wsStatus === "error" ? "text-red-600" : "text-zinc-400"
                  }`}>
                    <div className={`h-2 w-2 rounded-full ${
                      wsStatus === "connected" ? "bg-emerald-500 animate-pulse" :
                      wsStatus === "connecting" ? "bg-amber-500 animate-pulse" :
                      wsStatus === "error" ? "bg-red-500" : "bg-zinc-400"
                    }`} />
                    {wsStatus === "connected" ? "Connected" :
                     wsStatus === "connecting" ? "Connecting..." :
                     wsStatus === "error" ? "Error" : "Idle"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">STT Provider</span>
                  <span className="text-zinc-700 dark:text-zinc-300 font-mono text-xs">whisper</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">LLM Provider</span>
                  <span className="text-zinc-700 dark:text-zinc-300 font-mono text-xs">ollama</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">TTS Provider</span>
                  <span className="text-zinc-700 dark:text-zinc-300 font-mono text-xs">kokoro</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-zinc-500" />
                    <CardTitle className="text-sm">System Prompt</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setShowPromptEditor(!showPromptEditor)}
                  >
                    {showPromptEditor ? "Done" : "Edit"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {showPromptEditor ? (
                  <Textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="text-xs min-h-[120px] resize-none"
                    placeholder="Enter system prompt for the AI voice agent..."
                  />
                ) : (
                  <div className="text-xs p-2 rounded bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 italic leading-relaxed">
                    &ldquo;{systemPrompt}&rdquo;
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <MicVocal className="h-4 w-4 text-zinc-500" />
                  <CardTitle className="text-sm">Voice Selection</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedVoice}
                  onValueChange={setSelectedVoice}
                  disabled={wsStatus === "connected" || wsStatus === "connecting"}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_VOICES.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>
                        <span className="flex items-center gap-2">
                          <span>{voice.name}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {voice.provider}
                          </Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-zinc-400 mt-2">
                  {transport === "websocket"
                    ? "Voice is processed server-side. Selected voice applies to TTS output."
                    : "Voice cloning is handled by the LiveKit agent worker on the backend."}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
