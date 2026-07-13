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
