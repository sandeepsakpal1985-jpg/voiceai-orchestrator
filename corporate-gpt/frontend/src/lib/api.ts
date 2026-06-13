/**
 * CorporateGPT API Client
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

async function getToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "API request failed");
  }

  return response.json();
}

interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

// ── Auth ──
export const auth = {
  login: async (email: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);
    
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(error.detail);
    }
    
    const data = await response.json();
    if (data.access_token) {
      localStorage.setItem("token", data.access_token);
    }
    return data;
  },
  
  register: (email: string, password: string, fullName: string) =>
    request<{ id: string; email: string }>("/auth/register", {
      method: "POST",
      body: { email, password, full_name: fullName },
    }),
    
  me: () => request<{ id: string; email: string; role: string }>("/auth/me"),
  
  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
    }
  },
};

// ── Chat ──
export interface Citation {
  filename: string;
  snippet: string;
  score: number;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  mode: string;
}

export const chat = {
  /** Send a chat message and get response with citations */
  send: (query: string, mode: string = "strict", chatId?: string) =>
    request<ChatResponse>("/chat/completions", {
      method: "POST",
      body: { query, mode, chat_id: chatId },
    }),

  /** Stream a response using Server-Sent Events via fetch */
  stream: async function* (query: string, mode: string = "strict") {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    
    const response = await fetch(`${API_URL}/chat/stream?query=${encodeURIComponent(query)}&mode=${mode}`, {
      headers,
    });
    
    if (!response.ok) throw new Error("Stream request failed");
    if (!response.body) throw new Error("No response body");
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            yield data;
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  },

  history: () => request<{ id: string; title: string }[]>("/chat/history"),
};

// ── Search ──
export const search = {
  query: (q: string, department?: string) =>
    request<{ results: any[] }>("/search", {
      method: "POST",
      body: { query: q, department },
    }),
};

// ── Documents ──
export const documents = {
  list: () => request<any[]>("/documents"),
  
  upload: async (file: File, metadata?: Record<string, string>) => {
    const form = new FormData();
    form.append("file", file);
    if (metadata) {
      Object.entries(metadata).forEach(([k, v]) => form.append(k, v));
    }
    const token = await getToken();
    const response = await fetch(`${API_URL}/documents/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!response.ok) throw new Error("Upload failed");
    return response.json();
  },
  
  delete: (id: string) => request(`/documents/${id}`, { method: "DELETE" }),
};

// ── Knowledge Health ──
export const knowledgeHealth = {
  /** Get overall health overview */
  score: () => request<{
    health_score: number;
    total_gaps: number;
    unresolved_count: number;
    gaps_by_type: Record<string, number>;
    gaps_by_severity: Record<string, number>;
    recommendations: string[];
  }>("/knowledge-health/"),
  
  /** List knowledge gaps */
  gaps: () => request<{ total_gaps: number; top_gaps: any[] }>("/knowledge-health/gaps"),
  
  /** Run full gap detection pipeline */
  analyze: () => request<{
    total_gaps_detected: number;
    categories: Record<string, number>;
  }>("/knowledge-health/analyze"),
  
  /** Document health analysis */
  docHealth: () => request<{ outdated_count: number; by_type: Record<string, number> }>("/knowledge-health/documents"),
};

// ── Analytics ──
export const analytics = {
  /** Get dashboard metrics */
  dashboard: () =>
    request<{
      questions_total: number;
      questions_per_day: number;
      active_users: number;
      total_documents: number;
      thumbs_up: number;
      thumbs_down: number;
      search_success_rate: number;
      period_days: number;
    }>("/analytics/dashboard"),
};

// ── FAQ ──
export const faq = {
  /** List FAQs */
  list: (department?: string) =>
    request<any[]>(`/faq/${department ? `?department=${department}` : ""}`),
  
  /** Record FAQ ask */
  recordAsk: (faqId: string) => request(`/faq/${faqId}/ask`, { method: "POST" }),
};

// ── Bookmarks ──
export const bookmarks = {
  /** List bookmarks */
  list: () => request<any[]>("/bookmarks/"),
  
  /** Create bookmark */
  create: (data: { bookmark_type: string; title: string; reference_id?: string; snippet?: string }) =>
    request<any>("/bookmarks/", { method: "POST", body: data }),
  
  /** Delete bookmark */
  delete: (id: string) => request(`/bookmarks/${id}`, { method: "DELETE" }),
};

// ── Notifications ──
export const notifications = {
  /** List notifications */
  list: () => request<any[]>("/notifications/"),
  
  /** Mark as read */
  markRead: (id: string) => request(`/notifications/${id}/read`, { method: "POST" }),
  
  /** Mark all as read */
  markAllRead: () => request("/notifications/read-all", { method: "POST" }),
};

// ── Audit Logs ──
export const auditLogs = {
  /** List audit logs */
  list: (action?: string, resourceType?: string, page?: number) =>
    request<any[]>(`/audit-logs/${action || resourceType || page
      ? `?${action ? `action=${action}&` : ""}${resourceType ? `resource_type=${resourceType}&` : ""}${page ? `page=${page}` : ""}`
      : ""
    }`),
};
