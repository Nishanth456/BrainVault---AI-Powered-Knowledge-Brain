# 🔍 Phase 5 — Semantic Search

> **Prerequisite**: Phase 4 complete — research paper agent works, master graph routes by type, storage layer stores embeddings in Qdrant, and the Papers Library UI style is established.
>
> **Goal**: Type any query in natural language → get relevant results from ACROSS all saved content — LinkedIn posts, blogs, papers, notes — ranked by relevance.
>
> **UI Rule**: Search results must reuse the existing card components (LinkedInCard, BlogCard, PaperCard, NoteCard) and be grouped by source type. The search page should feel like a unified brain, not a file browser.

---

## ✅ What You Ship at the End of Phase 5

```
1. Open the Search page at /search
2. Type a natural language query, e.g. "RAG evaluation techniques"
3. Backend generates a query embedding with the same Ollama model used at save time
4. Qdrant returns the top-N most similar knowledge items across all types
5. Results are grouped by source type:
   - From LinkedIn (2)
   - From Blogs (1)
   - From Research Papers (1)
   - From Notes (1)
6. Each result shows the existing card component with title, summary, tags, difficulty, tree path
7. Click a result → navigates to that knowledge item's detail page
8. Filters work: content type, difficulty range, knowledge tree
9. Empty state explains "Your brain has no results for this yet. Add some content!"
10. Search bar is also available in the header on every page (keyboard shortcut /)
```

---

## 📁 New Files to Create / Update

```
backend/
├── routers/
│   ├── search.py               ← NEW: POST /api/search endpoint
│   └── knowledge.py            ← UPDATE: add GET /api/knowledge/{id} if missing
├── services/
│   ├── qdrant.py               ← UPDATE: add search_knowledge() helper
│   └── embedding.py            ← UPDATE: ensure generate_embedding() is async + consistent
├── main.py                     ← UPDATE: register search router
└── models/
    └── schemas.py              ← UPDATE: ensure KnowledgeItem has embedding_id

frontend/
├── app/search/page.tsx         ← NEW: full search page
├── components/search/
│   ├── SearchBar.tsx           ← NEW: reusable search input
│   ├── SearchFilters.tsx       ← NEW: filter sidebar
│   └── SearchResultCard.tsx    ← NEW: wrapper that renders the right card by type
├── components/layout/Header.tsx ← UPDATE: add persistent search bar + / shortcut
├── lib/api.ts                  ← UPDATE: add searchKnowledge() helper
└── app/layout.tsx              ← UPDATE: ensure search shortcut is global
```

---

## 🐍 Backend Implementation

### 1. `backend/services/qdrant.py` — Add Vector Search Helper

Add a search function that queries the existing `brainvault` collection using cosine similarity and optional payload filters.

```python
from qdrant_client.models import Filter, FieldCondition, MatchAny, Range
from backend.services.embedding import generate_embedding
from backend.config import settings


async def search_knowledge(
    query: str,
    limit: int = 20,
    filters: dict | None = None,
) -> list[dict]:
    """
    Search Qdrant for knowledge items similar to the query.

    Args:
        query: natural language query string
        limit: max number of results
        filters: optional dict with keys:
            - types: list[str] e.g. ["linkedin", "blog", "research_paper", "note"]
            - difficulty_max: int
            - knowledge_tree: str (exact match on leaf topic for now)

    Returns:
        List of payload dicts with added "score" and "id" fields.
    """
    vector = await generate_embedding(query)

    qdrant_filter = None
    conditions = []

    if filters:
        if filters.get("types"):
            conditions.append(
                FieldCondition(
                    key="type",
                    match=MatchAny(any=filters["types"]),
                )
            )
        if filters.get("difficulty_max") is not None:
            conditions.append(
                FieldCondition(
                    key="difficulty",
                    range=Range(lte=filters["difficulty_max"]),
                )
            )
        if filters.get("knowledge_tree"):
            conditions.append(
                FieldCondition(
                    key="knowledge_tree",
                    match=MatchAny(any=[filters["knowledge_tree"]]),
                )
            )

    if conditions:
        qdrant_filter = Filter(must=conditions)

    results = qdrant_client.search(
        collection_name=settings.QDRANT_COLLECTION,
        query_vector=vector,
        query_filter=qdrant_filter,
        limit=limit,
        with_payload=True,
        with_vectors=False,
    )

    return [
        {
            "id": str(r.id),
            "score": float(r.score),
            **(r.payload or {}),
        }
        for r in results
    ]
```

> **Important**: The embedding model must be the same one used during ingestion (`nomic-embed-text` via Ollama). If the collection was created with a different vector size, recreate it or use the same model.

---

### 2. `backend/routers/search.py` — Search Endpoint

Create a new router for semantic search.

```python
"""
search.py — Semantic search across all saved knowledge.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.models.database import get_db
from backend.models.schemas import KnowledgeItem, Attachment
from backend.services.qdrant import search_knowledge

router = APIRouter(prefix="/api/search", tags=["search"])


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    filters: Optional[dict] = Field(default_factory=dict)
    limit: int = Field(default=20, ge=1, le=100)


class SearchResult(BaseModel):
    id: str
    type: str
    title: str
    summary: str
    source_url: Optional[str] = None
    author: Optional[str] = None
    key_concepts: list[str] = []
    tags: list[str] = []
    difficulty: Optional[int] = None
    knowledge_tree: Optional[str] = None
    knowledge_domain: Optional[str] = None
    score: float
    created_at: Optional[str] = None
    attachments: list[dict] = []


@router.post("")
async def search(request: SearchRequest, db: AsyncSession = Depends(get_db)):
    """
    Semantic search across all knowledge items.
    Returns results grouped by type, enriched from PostgreSQL.
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")

    # 1. Vector search in Qdrant
    qdrant_results = await search_knowledge(
        query=request.query,
        limit=request.limit,
        filters=request.filters or {},
    )

    if not qdrant_results:
        return {"results": [], "grouped": {}}

    # 2. Enrich from PostgreSQL (source of truth for metadata + attachments)
    ids = [r["id"] for r in qdrant_results if r.get("id")]
    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.id.in_(ids))
    )
    items = result.scalars().all()
    item_map = {str(item.id): item for item in items}

    # 3. Merge Qdrant score with PG metadata, preserving Qdrant ranking
    enriched = []
    for r in qdrant_results:
        item = item_map.get(r["id"])
        if not item:
            continue

        enriched.append(SearchResult(
            id=str(item.id),
            type=item.type,
            title=item.title or "Untitled",
            summary=item.summary or "",
            source_url=item.source_url,
            author=item.author,
            key_concepts=item.key_concepts or [],
            tags=item.tags or [],
            difficulty=item.difficulty,
            knowledge_tree=item.knowledge_tree,
            knowledge_domain=item.knowledge_domain,
            score=r.get("score", 0.0),
            created_at=item.created_at.isoformat() if item.created_at else None,
            attachments=[
                {
                    "id": str(att.id),
                    "filename": att.filename,
                    "minio_path": att.minio_path,
                    "file_type": att.file_type,
                    "page_count": att.page_count,
                }
                for att in item.attachments
            ],
        ))

    # 4. Group by type for frontend rendering
    grouped: dict[str, list[SearchResult]] = {}
    for result in enriched:
        grouped.setdefault(result.type, []).append(result)

    return {
        "results": [r.model_dump() for r in enriched],
        "grouped": {k: [r.model_dump() for r in v] for k, v in grouped.items()},
    }
```

---

### 3. `backend/main.py` — Register Search Router

Add the new router alongside the existing ones:

```python
from backend.routers import search

app.include_router(search.router)
```

---

### 4. `backend/routers/knowledge.py` — Ensure Single Item Endpoint Exists

Make sure `GET /api/knowledge/{item_id}` returns full metadata for all types. It is needed when the user clicks a search result.

```python
@router.get("/{item_id}")
async def get_knowledge_item(item_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single knowledge item by ID with attachments."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(KnowledgeItem)
        .options(selectinload(KnowledgeItem.attachments))
        .where(KnowledgeItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")

    return {
        "id": str(item.id),
        "type": item.type,
        "title": item.title,
        "summary": item.summary,
        "source_url": item.source_url,
        "author": item.author,
        "key_concepts": item.key_concepts or [],
        "tags": item.tags or [],
        "difficulty": item.difficulty,
        "knowledge_tree": item.knowledge_tree,
        "knowledge_domain": item.knowledge_domain,
        "metadata": item.metadata or {},
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "attachments": [
            {
                "id": str(att.id),
                "filename": att.filename,
                "minio_path": att.minio_path,
                "file_type": att.file_type,
                "page_count": att.page_count,
            }
            for att in item.attachments
        ],
    }
```

---

## ⚛️ Frontend Implementation

### 1. `frontend/lib/api.ts` — Add Search Helper

Add a typed search helper next to the existing knowledge helpers.

```typescript
export interface SearchFilters {
  types?: string[]
  difficulty_max?: number
  knowledge_tree?: string
}

export interface SearchResultItem {
  id: string
  type: "linkedin" | "blog" | "research_paper" | "note" | string
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
```

---

### 2. `frontend/components/search/SearchResultCard.tsx` — Type-Aware Result Card

Render the correct existing card component based on the result type. This keeps search results visually consistent with each knowledge space.

```tsx
"use client"
import { LinkedInCard } from "@/components/knowledge/LinkedInCard"
import { BlogCard } from "@/components/knowledge/BlogCard"
import { PaperCard } from "@/components/knowledge/PaperCard"
import { NoteCard } from "@/components/knowledge/NoteCard"
import type { SearchResultItem } from "@/lib/api"

interface SearchResultCardProps {
  item: SearchResultItem
  onDelete?: (id: string) => void
}

export function SearchResultCard({ item, onDelete }: SearchResultCardProps) {
  // Normalize fields so existing card components accept them
  const normalized = {
    ...item,
    reading_time: item.type === "blog" || item.type === "note"
      ? (item as any).metadata?.reading_time_minutes || 1
      : undefined,
  }

  switch (item.type) {
    case "linkedin":
      return <LinkedInCard item={normalized as any} onDelete={onDelete} />
    case "blog":
      return <BlogCard item={normalized as any} onDelete={onDelete} />
    case "research_paper":
      return <PaperCard item={normalized as any} onDelete={onDelete} />
    case "note":
      return <NoteCard item={normalized as any} onDelete={onDelete} />
    default:
      return <BlogCard item={normalized as any} onDelete={onDelete} />
  }
}
```

> **Note**: The existing card components may need minor prop normalizations. If `PaperCard` expects `metadata.authors` as a list but PG stores it as a dict, handle that inside `PaperCard` or here.

---

### 3. `frontend/components/search/SearchFilters.tsx` — Filter Sidebar

A compact filter panel for the search page.

```tsx
"use client"
import { Button } from "@/components/ui/button"
import { SearchFilters as SearchFiltersType } from "@/lib/api"

const CONTENT_TYPES = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "blog", label: "Blogs" },
  { value: "research_paper", label: "Research Papers" },
  { value: "note", label: "Notes" },
]

interface SearchFiltersProps {
  filters: SearchFiltersType
  onChange: (filters: SearchFiltersType) => void
  onClear: () => void
}

export function SearchFilters({ filters, onChange, onClear }: SearchFiltersProps) {
  const toggleType = (type: string) => {
    const current = filters.types || []
    const next = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type]
    onChange({ ...filters, types: next.length ? next : undefined })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Content Type</h3>
        <div className="flex flex-wrap gap-2">
          {CONTENT_TYPES.map(t => {
            const active = filters.types?.includes(t.value)
            return (
              <button
                key={t.value}
                onClick={() => toggleType(t.value)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  active
                    ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                    : "bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Max Difficulty</h3>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={5}
            value={filters.difficulty_max || 5}
            onChange={e => onChange({ ...filters, difficulty_max: parseInt(e.target.value) })}
            className="flex-1 accent-indigo-500"
          />
          <span className="text-xs text-zinc-400 w-6">{filters.difficulty_max || 5}</span>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onClear}
        className="border-white/10 text-zinc-400 hover:text-white w-full"
      >
        Clear Filters
      </Button>
    </div>
  )
}
```

---

### 4. `frontend/app/search/page.tsx` — Search Page

Full search page with query input, filters, grouped results, and empty states.

```tsx
"use client"
import { useEffect, useState, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { SearchResultCard } from "@/components/search/SearchResultCard"
import { SearchFilters } from "@/components/search/SearchFilters"
import { EmptyState } from "@/components/ui/EmptyState"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { searchKnowledge, type SearchResultItem, type SearchFilters as SearchFiltersType } from "@/lib/api"
import { Search, Filter, X, Loader2 } from "lucide-react"

const TYPE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  blog: "Blogs",
  research_paper: "Research Papers",
  note: "Notes",
}

const TYPE_ORDER = ["linkedin", "blog", "research_paper", "note"]

export default function SearchPage() {
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get("q") || ""

  const [query, setQuery] = useState(initialQuery)
  const [inputValue, setInputValue] = useState(initialQuery)
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [grouped, setGrouped] = useState<Record<string, SearchResultItem[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [filters, setFilters] = useState<SearchFiltersType>({})
  const [showFilters, setShowFilters] = useState(false)

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setGrouped({})
      return
    }
    setLoading(true)
    setError(false)
    try {
      const data = await searchKnowledge(q, filters, 20)
      setResults(data.results)
      setGrouped(data.grouped)
    } catch (e) {
      console.error(e)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    if (initialQuery) performSearch(initialQuery)
  }, [initialQuery, performSearch])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setQuery(inputValue)
    performSearch(inputValue)
  }

  const groupedKeys = useMemo(() => {
    return TYPE_ORDER.filter(k => grouped[k]?.length > 0)
  }, [grouped])

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/15 flex items-center justify-center">
              <Search size={16} className="text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Semantic Search</h1>
          </div>
          <p className="text-zinc-500 text-sm">
            Search across everything in your BrainVault — LinkedIn posts, blogs, papers, and notes.
          </p>
        </div>

        {/* Search form */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="e.g. RAG evaluation techniques"
                className="pl-10 h-11 bg-white/[0.03] border-white/[0.08] text-white placeholder:text-zinc-600"
              />
              {inputValue && (
                <button
                  type="button"
                  onClick={() => { setInputValue(""); setQuery(""); setResults([]); setGrouped({}) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <Button
              type="submit"
              disabled={loading || !inputValue.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white h-11 px-5"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : "Search"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowFilters(p => !p)}
              className={`border-white/10 h-11 px-4 ${showFilters ? "text-indigo-300 border-indigo-500/30" : "text-zinc-400"}`}
            >
              <Filter size={16} />
            </Button>
          </div>
        </form>

        {/* Filters */}
        {showFilters && (
          <div className="mb-8 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08]">
            <SearchFilters
              filters={filters}
              onChange={setFilters}
              onClear={() => setFilters({})}
            />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i}>
                <div className="h-4 w-32 bg-white/[0.05] rounded-lg animate-pulse mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="h-64 bg-white/[0.03] rounded-2xl animate-pulse border border-white/[0.05]" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <EmptyState
            icon={<Search size={24} className="text-indigo-400" />}
            title="Search failed"
            description="Could not reach the BrainVault backend. Make sure it is running on port 8000."
            hint="Run: uvicorn backend.main:app --reload"
          />
        )}

        {/* Empty */}
        {!loading && !error && query && results.length === 0 && (
          <EmptyState
            icon={<Search size={24} className="text-indigo-400" />}
            title="No results found"
            description={`Your brain has no results for "${query}" yet.`}
            hint="Try a broader query, or add some content first."
          />
        )}

        {/* Initial state */}
        {!loading && !error && !query && (
          <EmptyState
            icon={<Search size={24} className="text-indigo-400" />}
            title="Search your knowledge brain"
            description="Type a question or topic above to find relevant content across all your saved items."
            hint="Try: "RAG evaluation", "prompt engineering tips", or "LLM inference"
          />
        )}

        {/* Grouped results */}
        {!loading && !error && results.length > 0 && (
          <div className="space-y-10">
            {groupedKeys.map(type => (
              <div key={type}>
                <div className="flex items-center gap-2.5 mb-4">
                  <h2 className="text-lg font-semibold text-white">{TYPE_LABELS[type] || type}</h2>
                  <span className="text-xs text-zinc-500">({grouped[type].length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {grouped[type].map(item => (
                    <SearchResultCard
                      key={item.id}
                      item={item}
                      onDelete={(id) => {
                        setResults(prev => prev.filter(r => r.id !== id))
                        setGrouped(prev => {
                          const next = { ...prev }
                          next[type] = next[type].filter(r => r.id !== id)
                          return next
                        })
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

---

### 5. `frontend/components/layout/Header.tsx` — Persistent Search Bar

Add a compact search input to the top header that is visible on every page. Press `/` to focus it. Submitting navigates to `/search?q=...`.

```tsx
"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"

export function Header() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchValue, setSearchValue] = useState("")

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchValue.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchValue.trim())}`)
      setSearchValue("")
    }
  }

  return (
    <header className="h-16 border-b border-white/[0.08] bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50 px-4 sm:px-6 flex items-center justify-between">
      {/* Logo / title */}
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-white">BrainVault</span>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSubmit} className="hidden sm:flex items-center flex-1 max-w-md mx-6">
        <div className="relative w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            placeholder="Search your brain... (/)"
            className="w-full h-9 pl-9 pr-4 rounded-full bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-colors"
          />
        </div>
      </form>

      {/* Right side placeholder */}
      <div className="w-8" />
    </header>
  )
}
```

---

## 🎨 UI / Flow Rules

| Element | Rule |
|---------|------|
| Result cards | Reuse existing `LinkedInCard`, `BlogCard`, `PaperCard`, `NoteCard` |
| Grouping | Group by `type` with count badges |
| Group order | LinkedIn → Blogs → Research Papers → Notes |
| Empty state | Show when query returns nothing, with hint to broaden or add content |
| Header search | Always visible on desktop; `/` shortcut focuses it |
| Mobile search | Header search hidden on small screens; use /search page directly |
| Filters | Content type chips + max difficulty slider |
| Click behavior | Card navigates to the item's detail page (or source URL for blogs) |

---

## ✅ Phase 5 Completion Checklist

### Backend
- [ ] `backend/services/qdrant.py` has `search_knowledge()` helper
- [ ] `search_knowledge()` uses the same embedding model as ingestion
- [ ] `backend/routers/search.py` created with `POST /api/search`
- [ ] Search endpoint accepts `query`, `filters`, and `limit`
- [ ] Search endpoint enriches Qdrant results from PostgreSQL
- [ ] Search endpoint returns both flat `results` and `grouped` by type
- [ ] `backend/main.py` registers the search router
- [ ] `GET /api/knowledge/{id}` returns full item metadata + attachments
- [ ] Filters supported: `types`, `difficulty_max`, `knowledge_tree`

### Frontend
- [ ] `frontend/lib/api.ts` adds `searchKnowledge()` helper + types
- [ ] `frontend/components/search/SearchResultCard.tsx` renders correct card by type
- [ ] `frontend/components/search/SearchFilters.tsx` provides type + difficulty filters
- [ ] `frontend/app/search/page.tsx` implements full search page
- [ ] Search page handles loading, error, empty, and grouped result states
- [ ] `frontend/components/layout/Header.tsx` has persistent search bar + `/` shortcut
- [ ] Submitting header search navigates to `/search?q=...`

### Integration / Manual Tests
- [ ] Save at least one item of each type (LinkedIn, blog, paper, note)
- [ ] Search for a concept that appears in multiple types
- [ ] Verify results are grouped by type with correct counts
- [ ] Verify clicking a result navigates to the right detail page
- [ ] Verify content type filter reduces results
- [ ] Verify difficulty filter reduces results
- [ ] Verify `/` shortcut focuses header search bar
- [ ] Verify empty state appears for unmatched queries

---

## 🧪 Manual Test Sequence

```bash
# 1. Start all services
cd infrastructure
docker-compose up -d

# 2. Start backend
cd C:\Users\nisha\Projects\BrainVault
uvicorn backend.main:app --reload --port 8000

# 3. Start Celery worker (another terminal)
backend\venv\Scripts\celery.exe -A backend.tasks.ingestion worker --loglevel=info --pool=solo

# 4. Start frontend
cd frontend
npm run dev

# 5. Ingest one of each type (use the UI or curl)
curl -X POST http://localhost:8000/api/ingest \
  -H 'Content-Type: application/json' \
  -d '{"raw_input": "https://arxiv.org/abs/2305.10601"}'

# 6. Search via API
curl -X POST http://localhost:8000/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "RAG evaluation", "limit": 10}'

# 7. Open frontend
# http://localhost:3000/search?q=RAG%20evaluation
```

---

## 🔗 Next Phase

**Phase 6 — AI Chat (RAG)**: Use the same `search_knowledge()` helper to retrieve context chunks, then stream an LLM answer with citations. The search endpoint built here becomes the retrieval layer for chat.
