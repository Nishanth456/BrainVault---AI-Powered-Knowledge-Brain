/**
 * api.ts — Typed fetch wrappers for the BrainVault backend API.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export interface IngestResponse {
  job_id: string
  status: string
  message: string
}

export interface JobStatus {
  id: string
  status: "queued" | "running" | "done" | "failed"
  detected_type: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface KnowledgeItem {
  id: string
  type: string
  title: string | null
  summary: string | null
  source_url: string | null
  author: string | null
  knowledge_domain: string | null
  knowledge_tree: string | null
  difficulty: number | null
  tags: string[] | null
  created_at: string
}

export interface SearchFilters {
  types?: string[]
  difficulty_max?: number
  knowledge_tree?: string
  item_id?: string
}

export interface SearchResultItem {
  id: string
  type: "linkedin" | "blog" | "research" | "note" | "interview_qna" | string
  title: string
  summary: string
  source_url?: string
  author?: string
  key_concepts: string[]
  tags: string[]
  difficulty?: number
  knowledge_tree?: string
  knowledge_domain?: string | null
  score: number
  created_at?: string
  attachments: {
    id: string
    filename: string
    minio_path: string
    file_type: string
    page_count?: number
  }[]
}

// ── Ingest ────────────────────────────────────────────────────────────────────

export async function ingest(rawInput: string): Promise<IngestResponse> {
  const res = await fetch(`${API_BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_input: rawInput }),
  })
  if (!res.ok) throw new Error(`Ingest failed: ${res.status}`)
  return res.json()
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/api/ingest/${jobId}/status`)
  if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`)
  return res.json()
}

// ── Knowledge ─────────────────────────────────────────────────────────────────

export async function listKnowledgeItems(type?: string, limit = 20): Promise<{ items: KnowledgeItem[]; total: number }> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (type) params.set("type", type)
  const res = await fetch(`${API_BASE}/api/knowledge?${params}`)
  if (!res.ok) throw new Error(`List failed: ${res.status}`)
  return res.json()
}

export async function listNotes(limit = 20): Promise<KnowledgeItem[]> {
  const res = await fetch(`${API_BASE}/api/knowledge/notes?limit=${limit}`)
  if (!res.ok) throw new Error(`Notes list failed: ${res.status}`)
  return res.json()
}

export async function listBlogs(limit = 20): Promise<KnowledgeItem[]> {
  const res = await fetch(`${API_BASE}/api/knowledge/blogs?limit=${limit}`)
  if (!res.ok) throw new Error(`Blogs list failed: ${res.status}`)
  return res.json()
}

export async function listPapers(limit = 20): Promise<KnowledgeItem[]> {
  const res = await fetch(`${API_BASE}/api/knowledge/papers?limit=${limit}`)
  if (!res.ok) throw new Error(`Papers list failed: ${res.status}`)
  return res.json()
}

export async function getGitHubRepos(limit = 20): Promise<KnowledgeItem[]> {
  const res = await fetch(`${API_BASE}/api/knowledge/github?limit=${limit}`)
  if (!res.ok) throw new Error(`GitHub list failed: ${res.status}`)
  return res.json()
}

export async function getYouTubeVideos(limit = 20): Promise<KnowledgeItem[]> {
  const res = await fetch(`${API_BASE}/api/knowledge/youtube?limit=${limit}`)
  if (!res.ok) throw new Error(`YouTube list failed: ${res.status}`)
  return res.json()
}

export async function getKnowledgeItem(id: string): Promise<KnowledgeItem> {
  const res = await fetch(`${API_BASE}/api/knowledge/${id}`)
  if (!res.ok) throw new Error(`Get failed: ${res.status}`)
  return res.json()
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<{ status: string; services: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/health`)
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
  return res.json()
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function searchKnowledge(
  query: string,
  filters: SearchFilters = {},
  limit = 20
): Promise<{ results: SearchResultItem[]; grouped: Record<string, SearchResultItem[]> }> {
  const res = await fetch(`${API_BASE}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, filters, limit }),
  })
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  citations: SearchResultItem[]
  created_at: string
}

export interface ChatSession {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}

// ── Phase 12 Additions ───────────────────────────────────────────────────────

export interface DashboardStats {
  total: number
  by_type: Record<string, number>
  bookmarked: number
  recent: { id: string; type: string; title: string | null; created_at: string }[]
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_BASE}/api/knowledge/stats`)
  if (!res.ok) throw new Error("Failed to load stats")
  return res.json()
}

export async function toggleBookmark(itemId: string): Promise<{ is_bookmarked: boolean }> {
  const res = await fetch(`${API_BASE}/api/knowledge/${itemId}/bookmark`, { method: "PATCH" })
  if (!res.ok) throw new Error("Failed to toggle bookmark")
  return res.json()
}

export async function softDeleteItem(itemId: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_BASE}/api/knowledge/${itemId}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete")
  return res.json()
}

export async function restoreItem(itemId: string): Promise<{ restored: boolean }> {
  const res = await fetch(`${API_BASE}/api/knowledge/${itemId}/restore`, { method: "POST" })
  if (!res.ok) throw new Error("Failed to restore")
  return res.json()
}

export async function getTrashItems(): Promise<SearchResultItem[]> {
  const res = await fetch(`${API_BASE}/api/knowledge/trash`)
  if (!res.ok) throw new Error("Failed to load trash")
  return res.json()
}

export async function exportItem(itemId: string, format: "markdown" | "json"): Promise<string> {
  const res = await fetch(`${API_BASE}/api/knowledge/${itemId}/export?format=${format}`)
  if (!res.ok) throw new Error("Failed to export")
  return res.text()
}

export interface ChatStreamCallbacks {
  onToken?: (token: string) => void
  onCitations?: (citations: SearchResultItem[]) => void
  onDone?: (sessionId: string) => void
  onError?: (error: Error) => void
}

export function sendChatMessage(
  message: string,
  callbacks: ChatStreamCallbacks = {},
  sessionId?: string,
  filters?: SearchFilters
): () => void {
  const abortController = new AbortController()
  const { onToken, onCitations, onDone, onError } = callbacks

  ;(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, session_id: sessionId, filters }),
        signal: abortController.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`Chat failed: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const parts = buffer.split("\n\n")
        buffer = parts.pop() ?? ""

        for (const part of parts) {
          const lines = part.split("\n")
          let event = ""
          let data = ""
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7)
            if (line.startsWith("data: ")) data = line.slice(6)
          }
          if (!event || !data) continue

          try {
            const payload = JSON.parse(data)
            if (event === "token" && onToken) onToken(payload)
            if (event === "citations" && onCitations) onCitations(payload)
            if (event === "done" && onDone) onDone(payload.session_id)
          } catch (e) {
            console.warn("Failed to parse SSE payload", e)
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError" && onError) {
        onError(err as Error)
      }
    }
  })()

  return () => abortController.abort()
}

export async function listChatSessions(): Promise<{ sessions: ChatSession[] }> {
  const res = await fetch(`${API_BASE}/api/chat/sessions`)
  if (!res.ok) throw new Error(`Sessions list failed: ${res.status}`)
  return res.json()
}

export async function getChatSession(sessionId: string): Promise<ChatSession & { messages: ChatMessage[] }> {
  const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}`)
  if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`)
  return res.json()
}
