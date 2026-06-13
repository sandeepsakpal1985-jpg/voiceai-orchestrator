"use client";
import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { MessageSquare, Lightbulb, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { chat as chatApi } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: { filename: string; snippet: string; score: number }[];
  feedback?: "up" | "down" | null;
}

const suggestions = [
  "How do I approve a vendor payment?",
  "What is the leave policy?",
  "How many leaves am I entitled to?",
  "What is the expense reimbursement process?",
  "How do I onboard a new employee?",
  "What is the IT helpdesk process?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"strict" | "general" | "expert">("strict");
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Check backend availability on mount
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/health`)
      .then(() => setApiAvailable(true))
      .catch(() => setApiAvailable(false));
  }, []);

  const handleFeedback = async (messageId: string, rating: "up" | "down") => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, feedback: m.feedback === rating ? null : rating } : m
      )
    );
    // Submit feedback to API
    try {
      const token = localStorage.getItem("token");
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/feedback/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message_id: messageId,
            rating: rating === "up" ? 1 : -1,
          }),
        }
      );
    } catch {
      // Feedback submission is best-effort
    }
  };

  const handleSend = async (query: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: query,
    };
    
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
    };
    
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);

    try {
      const response = await chatApi.send(query, mode);
      
      // Simulate streaming effect with the full response
      const words = response.answer.split(" ");
      for (let i = 0; i < words.length; i++) {
        await new Promise((r) => setTimeout(r, 20));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: words.slice(0, i + 1).join(" ") + " " }
              : m
          )
        );
      }
      
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, content: response.answer, citations: response.citations }
            : m
        )
      );
    } catch (error) {
      console.error("[Chat] API request failed:", error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessage.id
            ? {
                ...m,
                content: `I'm unable to reach the knowledge base right now. ${
                  apiAvailable === false
                    ? "The backend server appears to be offline. Please ensure the API server is running."
                    : "Please try again in a moment."
                }`,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {apiAvailable === false && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-yellow-500" />
          Backend offline — running in demo mode with sample responses.
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-lg">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <MessageSquare className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">How can I help you today?</h2>
            <p className="text-muted-foreground mb-8">
              Ask questions about company policies, procedures, and knowledge.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSend(suggestion)}
                  className="text-left p-3 rounded-lg border bg-card hover:bg-accent transition-colors text-sm"
                >
                  <Lightbulb className="h-4 w-4 text-primary mb-1" />
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-2 mt-8">
              {(["strict", "general", "expert"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto" ref={scrollRef}>
            <div className="max-w-4xl mx-auto divide-y divide-border/50">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  citations={(message as any).citations}                      isStreaming={
                        message.role === "assistant" &&
                        message.id === messages[messages.length - 1]?.id &&
                        isLoading
                      }
                  />
                  {message.role === "assistant" && message.content && !isLoading && (
                    <div className="flex items-center gap-1 px-16 pb-2">
                      <button
                        onClick={() => handleFeedback(message.id, "up")}
                        className={`p-1.5 rounded-md transition-colors ${
                          message.feedback === "up"
                            ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                            : "text-muted-foreground hover:bg-accent"
                        }`}
                        title="Helpful"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleFeedback(message.id, "down")}
                        className={`p-1.5 rounded-md transition-colors ${
                          message.feedback === "down"
                            ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                            : "text-muted-foreground hover:bg-accent"
                        }`}
                        title="Not helpful"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
              ))}
            </div>
          </div>
          <ChatInput onSend={handleSend} isLoading={isLoading} />
        </div>
      )}
    </div>
  );
}
