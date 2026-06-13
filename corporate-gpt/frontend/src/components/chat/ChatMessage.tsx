"use client";
import React from "react";
import ReactMarkdown from "react-markdown";
import { Building2, User, FileText, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface Citation {
  filename: string;
  snippet: string;
  score: number;
}

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, citations, isStreaming }: ChatMessageProps) {
  return (
    <div
      className={cn(
        "flex gap-4 py-6 animate-fade-in",
        role === "assistant" ? "bg-muted/30" : ""
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center",
          role === "assistant"
            ? "bg-primary/10 text-primary"
            : "bg-secondary text-secondary-foreground"
        )}
      >
        {role === "assistant" ? (
          <Building2 className="h-4 w-4" />
        ) : (
          <User className="h-4 w-4" />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-4">
        <div className={cn("prose prose-sm dark:prose-invert max-w-none", isStreaming && "streaming-cursor")}>
          <ReactMarkdown
            components={{
              code({ className, children, ...props }) {
                const isInline = !className;
                if (isInline) {
                  return (
                    <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                      {children}
                    </code>
                  );
                }
                return (
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                );
              },
              table({ children }) {
                return (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse border border-border">
                      {children}
                    </table>
                  </div>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>

        {citations && citations.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3 w-3" />
              <span>Sources</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {citations.map((citation, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-background border text-xs hover:bg-accent cursor-pointer transition-colors"
                >
                  <FileText className="h-3 w-3 text-primary" />
                  <span className="font-medium">{citation.filename}</span>
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {Math.round(citation.score * 100)}%
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
