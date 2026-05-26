"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import Navbar from "@/components/dashboard/navbar";
import {
  Send,
  PhoneCall,
  PhoneOff,
  Bot,
  User,
  Smile,
  Frown,
  Meh,
  Loader2,
  Radio,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "agent" | "user";
  content: string;
  timestamp: number;
};

type ConversationStatus = "idle" | "connecting" | "connected" | "ended";

export default function AIAgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sentiment, setSentiment] = useState<string>("neutral");
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [contactName, setContactName] = useState("Demo Caller");
  const [contactPhone, setContactPhone] = useState("+1 (555) 123-4567");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  const speakText = useCallback((text: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsAgentSpeaking(true);
      utterance.onend = () => setIsAgentSpeaking(false);
      utterance.onerror = () => setIsAgentSpeaking(false);
      synthRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const startCall = useCallback(async () => {
    setStatus("connecting");
    setMessages([]);
    setStreamingText("");
    setSentiment("neutral");

    try {
      const res = await fetch("/api/agent/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: contactPhone,
          contactName,
          prompt:
            "You are a friendly AI voice assistant for VoiceAI platform. You're calling to demo the AI agent capabilities. Be conversational, ask about their interest in AI voice solutions, and answer questions about features and pricing. Keep responses concise.",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setConversationId(data.conversationId);
      setStatus("connected");

      // Add initial agent message
      const initialMsg: Message = {
        id: `msg-${Date.now()}`,
        role: "agent",
        content: data.message,
        timestamp: Date.now(),
      };
      setMessages([initialMsg]);
      speakText(data.message);

      // Connect to SSE stream
      const es = new EventSource(
        `/api/agent/stream?conversationId=${data.conversationId}`
      );

      es.addEventListener("agent_response", (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const msg: Message = {
            id: `msg-${Date.now()}`,
            role: "agent",
            content: parsed.message.content,
            timestamp: parsed.message.timestamp,
          };
          setMessages((prev) => [...prev, msg]);
          speakText(parsed.message.content);
        } catch {}
      });

      es.addEventListener("sentiment_update", (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setSentiment(parsed.sentiment.label);
        } catch {}
      });

      es.addEventListener("conversation_ended", () => {
        setStatus("ended");
        es.close();
      });

      es.addEventListener("error", (event) => {
        console.warn("SSE connection error, will auto-reconnect:", event);
      });

      eventSourceRef.current = es;
    } catch (err) {
      console.error("Failed to start call:", err);
      setStatus("idle");
    }
  }, [contactName, contactPhone, speakText]);

  const endCall = useCallback(async () => {
    if (!conversationId) return;

    try {
      await fetch("/api/agent/call", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          action: "end",
        }),
      });
    } catch {}

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (synthRef.current) {
      window.speechSynthesis.cancel();
    }
    setStatus("ended");
    setIsAgentSpeaking(false);
  }, [conversationId]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !conversationId || status !== "connected") return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      await fetch("/api/agent/call", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          action: "process_input",
          userInput: userMsg.content,
        }),
      });
    } catch {}
  }, [input, conversationId, status]);

  const resetCall = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (synthRef.current) {
      window.speechSynthesis.cancel();
    }
    setMessages([]);
    setStatus("idle");
    setConversationId(null);
    setSentiment("neutral");
    setIsAgentSpeaking(false);
    setStreamingText("");
  }, []);

  const sentimentColor = {
    very_positive: "text-emerald-500",
    positive: "text-emerald-400",
    neutral: "text-zinc-400",
    negative: "text-amber-500",
    very_negative: "text-red-500",
  }[sentiment] ?? "text-zinc-400";

  const SentimentIcon = {
    very_positive: Smile,
    positive: Smile,
    neutral: Meh,
    negative: Frown,
    very_negative: Frown,
  }[sentiment] ?? Meh;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />
      <div className="p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  AI Voice Agent
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Real-time conversation with the AI agent
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {status === "idle" && (
                <Button
                  onClick={startCall}
                  className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white"
                >
                  <PhoneCall className="h-4 w-4 mr-2" />
                  Start Call
                </Button>
              )}
              {status === "connecting" && (
                <Button disabled variant="outline">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </Button>
              )}
              {(status === "connected" || status === "ended") && (
                <div className="flex items-center gap-2">
                  {status === "connected" && (
                    <Button
                      onClick={endCall}
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
                    >
                      <PhoneOff className="h-4 w-4 mr-2" />
                      End Call
                    </Button>
                  )}
                  <Button onClick={resetCall} variant="ghost">
                    New Call
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Chat Area */}
            <div className="lg:col-span-2">
              <Card className="h-[600px] flex flex-col">
                <CardHeader className="border-b border-zinc-200 dark:border-zinc-800 py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          status === "connected"
                            ? "bg-emerald-500 animate-pulse"
                            : status === "connecting"
                            ? "bg-amber-500 animate-pulse"
                            : "bg-zinc-300"
                        )}
                      />
                      <CardTitle className="text-sm font-medium">
                        {status === "idle" && "Ready to call"}
                        {status === "connecting" && "Connecting..."}
                        {status === "connected" && `Live — ${contactName}`}
                        {status === "ended" && "Call ended"}
                      </CardTitle>
                    </div>
                    {isAgentSpeaking && (
                      <Badge variant="info" size="sm" className="gap-1">
                        <Volume2 className="h-3 w-3 animate-pulse" />
                        Speaking
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 p-0">
                  <ScrollArea className="h-[490px]">
                    <div className="p-4 space-y-4">
                      {messages.length === 0 && status === "idle" && (
                        <div className="flex flex-col items-center justify-center h-full text-center py-20">
                          <Bot className="h-16 w-16 text-zinc-300 dark:text-zinc-700 mb-4" />
                          <p className="text-zinc-400 dark:text-zinc-500 text-lg font-medium">
                            Ready to start a conversation
                          </p>
                          <p className="text-zinc-400 dark:text-zinc-600 text-sm mt-1">
                            Click &quot;Start Call&quot; to begin a demo with the AI agent
                          </p>
                        </div>
                      )}

                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex gap-3",
                            msg.role === "user" ? "justify-end" : "justify-start"
                          )}
                        >
                          {msg.role === "agent" && (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600">
                              <Bot className="h-4 w-4 text-white" />
                            </div>
                          )}
                          <div
                            className={cn(
                              "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                              msg.role === "agent"
                                ? "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200"
                                : "bg-gradient-to-r from-indigo-600 to-violet-600 text-white"
                            )}
                          >
                            {msg.content}
                          </div>
                          {msg.role === "user" && (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700">
                              <User className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
                            </div>
                          )}
                        </div>
                      ))}

                      {status === "connected" && streamingText && (
                        <div className="flex gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600">
                            <Bot className="h-4 w-4 text-white" />
                          </div>
                          <div className="max-w-[80%] rounded-2xl px-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-sm leading-relaxed">
                            {streamingText}
                            <span className="inline-block w-1.5 h-4 bg-indigo-500 ml-0.5 animate-pulse" />
                          </div>
                        </div>
                      )}

                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                </CardContent>

                {/* Input */}
                <div className="border-t border-zinc-200 dark:border-zinc-800 p-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendMessage();
                    }}
                    className="flex gap-2"
                  >
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={
                        status === "connected"
                          ? "Type your response..."
                          : "Start a call to begin chatting"
                      }
                      disabled={status !== "connected"}
                      className="flex-1"
                    />
                    <Button
                      type="submit"
                      disabled={status !== "connected" || !input.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </Card>
            </div>

            {/* Sidebar - Agent Status */}
            <div className="space-y-4">
              {/* Status Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Call Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Status</span>
                    <Badge
                      variant={
                        status === "connected"
                          ? "success"
                          : status === "connecting"
                          ? "warning"
                          : status === "ended"
                          ? "default"
                          : "default"
                      }
                      size="sm"
                    >
                      {status === "idle" && "Ready"}
                      {status === "connecting" && "Connecting"}
                      {status === "connected" && "Live"}
                      {status === "ended" && "Ended"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Contact</span>
                    <span className="text-sm font-medium">{contactName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Phone</span>
                    <span className="text-sm font-medium">{contactPhone}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Messages</span>
                    <span className="text-sm font-medium">{messages.length}</span>
                  </div>
                  {sentiment && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-500">Sentiment</span>
                      <div className="flex items-center gap-1.5">
                        <SentimentIcon className={cn("h-4 w-4", sentimentColor)} />
                        <span className="text-sm font-medium capitalize">
                          {sentiment.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Input
                    placeholder="Contact name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    disabled={status !== "idle"}
                    className="text-sm"
                  />
                  <Input
                    placeholder="Phone number"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    disabled={status !== "idle"}
                    className="text-sm"
                  />
                </CardContent>
              </Card>

              {/* Info Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <Radio className="h-4 w-4 text-indigo-500" />
                      Real-time Streaming
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-zinc-500 space-y-2">
                  <p>
                    This demo uses Server-Sent Events (SSE) for real-time
                    conversation streaming. The AI agent runs locally with a
                    simulation engine.
                  </p>
                  <p>
                    Connect an OpenAI API key via the{" "}
                    <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">
                      OPENAI_API_KEY
                    </code>{" "}
                    env variable for real LLM responses.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
