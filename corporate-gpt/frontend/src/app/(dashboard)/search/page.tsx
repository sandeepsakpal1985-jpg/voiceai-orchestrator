"use client";
import { useState } from "react";
import { Search, FileText, Loader2, Sparkles, SlidersHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface SearchResult {
  document_id: string;
  document_name: string;
  snippet: string;
  confidence_score: number;
}

export default function KnowledgeSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/search/?q=${encodeURIComponent(query)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data.semantic_results || []);
    } catch (err) {
      toast.error("Search failed — backend may be offline");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Knowledge Search</h2>
        <p className="text-muted-foreground">Search across all company documents</p>
      </div>

      <form onSubmit={handleSearch}>
        <Card>
          <CardContent className="p-4">
            <div className="relative flex items-center gap-2">
              <Search className="h-5 w-5 text-muted-foreground ml-2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search company policies, procedures, documents..."
                className="border-0 shadow-none focus-visible:ring-0 text-base pl-0"
              />
              <Button type="submit" disabled={loading || !query.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Search className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium">No results found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Try different keywords or browse documents instead.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Found {results.length} result{results.length !== 1 ? "s" : ""}
          </p>
          {results.map((result, i) => (
            <Card key={i} className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="h-4 w-4 text-primary" />
                      <h3 className="font-medium text-sm truncate">{result.document_name}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">{result.snippet}</p>
                  </div>
                  <Badge variant={result.confidence_score >= 0.8 ? "success" : result.confidence_score >= 0.6 ? "warning" : "secondary"} className="ml-4 shrink-0">
                    {Math.round(result.confidence_score * 100)}%
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!searched && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <p className="text-lg font-medium">Semantic Knowledge Search</p>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-md">
              Search across all company documents using AI-powered semantic search.
              Find policies, procedures, and information instantly.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
