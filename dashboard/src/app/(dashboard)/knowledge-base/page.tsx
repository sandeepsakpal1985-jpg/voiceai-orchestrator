"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  File,
  Search,
  Trash2,
  RefreshCw,
  Sparkles,
  Database,
  BookOpen,
  Hash,
  Layers,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
} from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import { Skeleton } from "@/components/ui/skeleton";

// Python orchestrator backend URL — configured via env var NEXT_PUBLIC_ORCHESTRATOR_URL
const ORCHESTRATOR_BASE = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://localhost:8000";

interface DocumentItem {
  id: string;
  name: string;
  type: string;
  size: string;
  status: string;
  tags: string[];
  date: string;
  chunkCount: number;
}

interface KnowledgeDocument {
  id: string;
  name: string;
  fileType?: string;
  fileSize?: number;
  status?: string;
  tags?: string[];
  createdAt?: string;
  chunkCount?: number;
  contentPreview?: string;
}

interface KnowledgeBaseResponse {
  documents: KnowledgeDocument[];
  total?: number;
  indexed?: number;
  processing?: number;
  failed?: number;
}

interface SearchResult {
  id: string;
  document: string;
  metadata: Record<string, unknown>;
  score: number;
}

interface RAGStatus {
  available: boolean;
  collection: string;
  documentCount: number;
  indexedCount: number;
}

const getFileIcon = (type: string) => {
  switch (type?.toLowerCase()) {
    case "pdf": return FileText;
    case "doc": case "docx": return FileText;
    case "xls": case "xlsx": return FileSpreadsheet;
    default: return File;
  }
};

export default function KnowledgeBasePage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Semantic search state
  const [semanticQuery, setSemanticQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // RAG Status
  const [ragStatus, setRagStatus] = useState<RAGStatus | null>(null);

  // Upload state
  const [activeTab, setActiveTab] = useState("documents");
  const [indexText, setIndexText] = useState("");

  // Fetch helpers
  const refreshDocuments = async () => {
    try {
      const res = await fetch("/api/knowledge-base");
      const data: KnowledgeBaseResponse = await res.json();
      const list = data.documents ?? [];
      setDocuments(list.map((d: KnowledgeDocument) => ({
        id: d.id,
        name: d.name,
        type: d.fileType ?? "unknown",
        size: d.fileSize ? `${(d.fileSize / (1024 * 1024)).toFixed(1)} MB` : "0 B",
        status: d.status?.toLowerCase() ?? "pending",
        tags: d.tags ?? [],
        date: d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "N/A",
        chunkCount: d.chunkCount ?? 0,
      })));
    } catch (err) {
      console.error("Failed to fetch documents", err);
    }
  };

  const refreshRAGStatus = async () => {
    try {
      const res = await fetch(`${ORCHESTRATOR_BASE}/knowledge/rag/status`);
      const data = await res.json();
      setRagStatus(data);
    } catch {
      // RAG service may not be running - that's fine
    }
  };

  // Initial data load
  useEffect(() => {
    (async () => {
      await refreshDocuments();
      await refreshRAGStatus();
      setLoading(false);
    })();
  }, []);

  const filtered = documents.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const doSemanticSearch = async () => {
    if (!semanticQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${ORCHESTRATOR_BASE}/knowledge/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: semanticQuery, top_k: 10 }),
      });
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } catch (err) {
      console.error("Semantic search failed", err);
    } finally {
      setSearching(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      await fetch(`${ORCHESTRATOR_BASE}/knowledge/upload`, {
        method: "POST",
        body: formData,
      });
      await refreshDocuments();
      await refreshRAGStatus();
    } catch (err) {
      console.error("Upload failed", err);
    }
  };

  const handleIndexText = async () => {
    if (!indexText.trim()) return;
    try {
      await fetch(`${ORCHESTRATOR_BASE}/knowledge/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: indexText, tags: ["manual"] }),
      });
      setIndexText("");
      await refreshDocuments();
      await refreshRAGStatus();
    } catch (err) {
      console.error("Index failed", err);
    }
  };

  const handleReindex = async (docId: string) => {
    try {
      const res = await fetch(`${ORCHESTRATOR_BASE}/knowledge/${docId}/reindex`, {
        method: "POST",
      });
      if (res.ok) {
        await refreshDocuments();
        await refreshRAGStatus();
      }
    } catch (err) {
      console.error("Reindex failed", err);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      const res = await fetch(`${ORCHESTRATOR_BASE}/knowledge/${docId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await refreshDocuments();
        await refreshRAGStatus();
      }
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const getScoreColor = (score: number) => {
    // ChromaDB returns distance (lower = more similar), convert to similarity
    const similarity = Math.max(0, Math.min(1, 1 - score));
    if (similarity >= 0.7) return "text-emerald-600";
    if (similarity >= 0.4) return "text-amber-600";
    return "text-zinc-400";
  };

  const formatScore = (score: number) => {
    return (Math.max(0, Math.min(1, 1 - score)) * 100).toFixed(0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navbar />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Knowledge Base</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Upload documents, index content, and search with semantic AI
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* RAG Status */}
            {ragStatus && (
              <Badge variant={ragStatus.available ? "default" : "secondary"} className="gap-1">
                <Database className="h-3 w-3" />
                {ragStatus.available ? `${ragStatus.indexedCount} indexed` : "RAG offline"}
              </Badge>
            )}
            <label className="cursor-pointer">
              <Button className="gap-2" asChild>
                <span>
                  <Upload className="h-4 w-4" />
                  Upload
                </span>
              </Button>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.csv,.json"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Total Documents</p>
              <p className="text-2xl font-bold mt-1">{documents.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Indexed</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">
                {documents.filter((d) => d.status === "indexed").length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Processing</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">
                {documents.filter((d) => d.status === "processing").length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-zinc-500">Failed</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {documents.filter((d) => d.status === "failed").length}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-indigo-200 dark:border-indigo-800">
            <CardContent className="p-4">
              <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">RAG Status</p>
              <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300 mt-1 flex items-center gap-2">
                {ragStatus?.available ? (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Active</>
                ) : (
                  <><XCircle className="h-4 w-4 text-zinc-400" /> Offline</>
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Drop Zone */}
        <Card
          className={`border-2 border-dashed transition-colors ${
            isDragging
              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
              : "border-zinc-300 dark:border-zinc-700 hover:border-indigo-400"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) {
              const formData = new FormData();
              formData.append("file", file);
              fetch(`${ORCHESTRATOR_BASE}/knowledge/upload`, { method: "POST", body: formData })
                .then(() => { refreshDocuments(); refreshRAGStatus(); });
            }
          }}
        >
          <CardContent className="p-12 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
            <p className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Drop files here or click to upload
            </p>
            <p className="text-sm text-zinc-500 mb-4">
              Supports PDF, DOCX, TXT, CSV, and JSON files (max 50MB each)
            </p>
            <label className="cursor-pointer">
              <Button variant="outline" asChild>
                <span><Upload className="h-4 w-4 mr-2" /> Browse Files</span>
              </Button>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.csv,.json"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </CardContent>
        </Card>

        {/* Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="h-4 w-4" /> Documents
            </TabsTrigger>
            <TabsTrigger value="semantic-search" className="gap-2">
              <Sparkles className="h-4 w-4" /> Semantic Search
            </TabsTrigger>
            <TabsTrigger value="index-text" className="gap-2">
              <Hash className="h-4 w-4" /> Index Text
            </TabsTrigger>
          </TabsList>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>All Documents</CardTitle>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      placeholder="Filter documents..."
                      className="pl-9 h-9 w-72"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filtered.length === 0 ? (
                  <p className="text-center py-8 text-sm text-zinc-400">
                    No documents found. Upload your first document to get started.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filtered.map((doc) => {
                      const Icon = getFileIcon(doc.type);
                      return (
                        <div
                          key={doc.id}
                          className="flex items-center gap-4 p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
                        >
                          <div className="h-10 w-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                            <Icon className="h-5 w-5 text-zinc-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{doc.name}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs text-zinc-400">{doc.size}</span>
                              <span className="text-xs text-zinc-300">·</span>
                              <span className="text-xs text-zinc-400">{doc.date}</span>
                              {doc.chunkCount > 0 && (
                                <>
                                  <span className="text-xs text-zinc-300">·</span>
                                  <span className="text-xs text-zinc-400 flex items-center gap-1">
                                    <Layers className="h-3 w-3" /> {doc.chunkCount} chunks
                                  </span>
                                </>
                              )}
                              {doc.tags.length > 0 && doc.tags.map((tag: string) => (
                                <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                              ))}
                            </div>
                          </div>
                          <Badge
                            variant={doc.status === "indexed" ? "default" : doc.status === "failed" ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {doc.status === "indexed" ? (
                              <><CheckCircle2 className="h-3 w-3 mr-1" /> Indexed</>
                            ) : doc.status === "processing" ? (
                              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processing</>
                            ) : doc.status === "failed" ? (
                              <><AlertCircle className="h-3 w-3 mr-1" /> Failed</>
                            ) : (
                              doc.status
                            )}
                          </Badge>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleReindex(doc.id)}
                              title="Re-index"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-zinc-400 hover:text-red-600"
                              onClick={() => handleDeleteDoc(doc.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Semantic Search Tab */}
          <TabsContent value="semantic-search" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-500" />
                  Semantic Search
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-zinc-500">
                  Search your knowledge base using AI-powered semantic understanding.
                  Results are ranked by relevance to your query.
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                      placeholder="Ask a question or search semantically..."
                      className="pl-9"
                      value={semanticQuery}
                      onChange={(e) => setSemanticQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && doSemanticSearch()}
                    />
                  </div>
                  <Button onClick={doSemanticSearch} disabled={searching || !semanticQuery.trim()} className="gap-2">
                    {searching ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Searching...</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> Search</>
                    )}
                  </Button>
                </div>

                {/* Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        {searchResults.length} results found
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setSearchResults([]); setSemanticQuery(""); }}
                        className="text-xs"
                      >
                        Clear
                      </Button>
                    </div>
                    {searchResults.map((result, i) => {
                      const md = result.metadata as Record<string, unknown>;
                      return (
                        <Card key={result.id || i} className="border-indigo-100 dark:border-indigo-900/30">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <Eye className="h-3 w-3" />
                                Score: {formatScore(result.score)}%
                              </Badge>
                              <span className={`text-xs font-bold ${getScoreColor(result.score)}`}>
                                {String(md.name ?? "Document chunk")}
                              </span>
                            </div>
                            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap line-clamp-4">
                              {result.document}
                            </p>
                            {md.chunk_index !== undefined && (
                              <p className="text-[10px] text-zinc-400 mt-2">
                                Chunk {(md.chunk_index as number) + 1} of {String(md.chunk_count ?? "")}
                                {!!md.file_type && <> · {String(md.file_type)}</>}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {searching && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                  </div>
                )}

                {!searching && searchResults.length === 0 && semanticQuery && (
                  <div className="text-center py-8">
                    <AlertCircle className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500">No results found</p>
                    <p className="text-xs text-zinc-400 mt-1">Try a different query or index more documents</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Index Text Tab */}
          <TabsContent value="index-text" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-5 w-5 text-indigo-500" />
                  Index Raw Text
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-zinc-500">
                  Paste or type text content to index directly into the vector database.
                  This is useful for documentation, FAQs, and knowledge articles.
                </p>
                <Textarea
                  placeholder="Paste your content here to index it into the knowledge base..."
                  className="min-h-[200px]"
                  value={indexText}
                  onChange={(e) => setIndexText(e.target.value)}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-400">
                    {indexText.length} characters · Will be chunked into ~500 char segments
                  </p>
                  <Button
                    onClick={handleIndexText}
                    disabled={!indexText.trim()}
                    className="gap-2"
                  >
                    <Database className="h-4 w-4" />
                    Index Content
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
