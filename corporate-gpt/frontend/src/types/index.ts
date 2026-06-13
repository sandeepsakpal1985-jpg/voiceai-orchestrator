export interface User {
  id: string
  email: string
  full_name: string
  organization_id: string
  role_id: string
  is_active: boolean
}

export interface Document {
  id: string
  original_filename: string
  file_type: string
  title: string
  is_indexed: boolean
  created_at: string
}

export interface Chat {
  id: string
  title: string
  message_count: number
  ai_mode: string
  created_at: string
}

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  citations: Citation[]
}

export interface Citation {
  document_name: string
  snippet: string
  page_number?: number
  confidence_score: number
}

export interface Analytics {
  questions_total: number
  questions_per_day: number
  active_users: number
  total_documents: number
  thumbs_up: number
  thumbs_down: number
  search_success_rate: number
}
