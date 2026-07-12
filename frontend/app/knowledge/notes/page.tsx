"use client"

import { NoteItem, NoteListItem } from "@/components/knowledge/NoteListItem"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/EmptyState"
import {
    BookOpen,
    ChevronDown,
    ChevronRight,
    Clock,
    Filter,
    FolderOpen,
    Hash,
    MessageCircle,
    RefreshCw,
    Search,
    Sparkles,
    Zap,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

function groupNotes(items: NoteItem[]) {
  const domains: Record<string, Record<string, NoteItem[]>> = {}
  for (const item of items) {
    const domain = item.knowledge_domain || "General"
    const tree = item.knowledge_tree || "Uncategorized"

    if (!domains[domain]) domains[domain] = {}
    if (!domains[domain][tree]) domains[domain][tree] = []

    domains[domain][tree].push(item)
  }
  return domains
}

export default function NotesPage() {
  const [items, setItems] = useState<NoteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState("")
  const [collapsedTrees, setCollapsedTrees] = useState<Record<string, boolean>>({})

  const loadNotes = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    fetch("http://localhost:8000/api/knowledge/notes")
      .then((r) => {
        if (!r.ok) throw new Error("API error")
        return r.json()
      })
      .then((data) => {
        if (!cancelled) {
          setItems(Array.isArray(data) ? data : [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const cleanup = loadNotes()
    return cleanup
  }, [loadNotes])

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items
    const q = query.toLowerCase()
    return items.filter(
      (item) =>
        item.title?.toLowerCase().includes(q) ||
        item.summary?.toLowerCase().includes(q) ||
        item.tags?.some((t) => t.toLowerCase().includes(q)) ||
        item.key_concepts?.some((c) => c.toLowerCase().includes(q)) ||
        item.knowledge_tree?.toLowerCase().includes(q) ||
        item.knowledge_domain?.toLowerCase().includes(q)
    )
  }, [items, query])

  const grouped = useMemo(() => groupNotes(filteredItems), [filteredItems])
  const domains = Object.keys(grouped).sort()

  const toggleTree = (key: string) => {
    setCollapsedTrees((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const totalReadingTime = useMemo(
    () => filteredItems.reduce((sum, i) => sum + (i.reading_time_minutes || 0), 0),
    [filteredItems]
  )

  const avgImportance = useMemo(() => {
    if (!filteredItems.length) return 0
    return Math.round(
      filteredItems.reduce((sum, i) => sum + (i.importance_score || 0), 0) / filteredItems.length
    )
  }, [filteredItems])

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 flex items-center justify-center">
                <MessageCircle size={18} className="text-cyan-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">AI Notes</h1>
            </div>
            <p className="text-zinc-500 text-sm max-w-xl">
              Pasted text, code snippets, ChatGPT conversations, and quick notes — auto-classified by domain, tree, and difficulty.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {!loading && (
              <span className="text-sm text-zinc-600 hidden sm:block">
                {filteredItems.length} {filteredItems.length === 1 ? "item" : "items"}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={loadNotes}
              className="border-white/10 text-zinc-400 hover:text-white h-8"
            >
              <RefreshCw size={13} className="mr-1.5" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" className="border-white/10 text-zinc-400 hover:text-white h-8">
              <Filter size={13} className="mr-1.5" />
              Filter
            </Button>
          </div>
        </div>

        {/* Stats strip */}
        {!loading && !error && items.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5">
              <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">
                <BookOpen size={12} />
                Notes
              </div>
              <div className="text-xl font-semibold text-white">{items.length}</div>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5">
              <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">
                <FolderOpen size={12} />
                Domains
              </div>
              <div className="text-xl font-semibold text-white">{domains.length}</div>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5">
              <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">
                <Clock size={12} />
                Reading time
              </div>
              <div className="text-xl font-semibold text-white">{totalReadingTime}m</div>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3.5">
              <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">
                <Zap size={12} />
                Avg importance
              </div>
              <div className="text-xl font-semibold text-white">{avgImportance}/10</div>
            </div>
          </div>
        )}

        {/* Search */}
        {!loading && !error && items.length > 0 && (
          <div className="relative mb-6">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search notes by title, tag, concept, or domain..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
            />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-32 bg-white/[0.03] rounded-xl animate-pulse border border-white/[0.05]"
              />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <EmptyState
            icon={<MessageCircle size={24} className="text-cyan-400" />}
            title="Could not load AI Notes"
            description="Make sure the BrainVault backend is running on port 8000."
            hint="Run: uvicorn backend.main:app --reload"
          />
        )}

        {/* Empty */}
        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={<MessageCircle size={24} className="text-cyan-400" />}
            title="No notes saved yet"
            description="Paste any raw text, code, or ChatGPT conversation in the dashboard to get started."
            hint="The Plain Text Agent infers topic, domain, and difficulty automatically."
          />
        )}

        {/* No search results */}
        {!loading && !error && items.length > 0 && filteredItems.length === 0 && (
          <EmptyState
            icon={<Hash size={24} className="text-zinc-400" />}
            title="No matches"
            description={`No notes match "${query}". Try a different keyword.`}
          />
        )}

        {/* Grouped list view */}
        {!loading && !error && domains.length > 0 && (
          <div className="space-y-10">
            {domains.map((domain) => {
              const trees = Object.keys(grouped[domain]).sort()

              return (
                <div key={domain}>
                  {/* Domain header */}
                  <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.08]">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                      <Sparkles size={14} className="text-cyan-400" />
                    </div>
                    <h2 className="text-lg font-bold text-white">{domain}</h2>
                    <span className="text-xs text-zinc-600 ml-auto">
                      {trees.length} {trees.length === 1 ? "tree" : "trees"}
                    </span>
                  </div>

                  <div className="space-y-6">
                    {trees.map((tree) => {
                      const treeItems = grouped[domain][tree]
                      const treeKey = `${domain}-${tree}`
                      const isCollapsed = collapsedTrees[treeKey]

                      return (
                        <div
                          key={tree}
                          className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden"
                        >
                          {/* Tree header */}
                          <button
                            onClick={() => toggleTree(treeKey)}
                            className="flex items-center gap-2.5 w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors border-b border-white/[0.05]"
                          >
                            <div className="w-5 h-5 rounded bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                              <FolderOpen size={11} className="text-emerald-400" />
                            </div>
                            <span className="text-sm font-semibold text-white/90">{tree}</span>
                            <span className="text-xs text-zinc-500 flex-shrink-0 ml-auto">
                              {treeItems.length} {treeItems.length === 1 ? "note" : "notes"}
                            </span>
                            {isCollapsed ? (
                              <ChevronRight size={14} className="text-zinc-600 flex-shrink-0" />
                            ) : (
                              <ChevronDown size={14} className="text-zinc-600 flex-shrink-0" />
                            )}
                          </button>

                          {/* List items */}
                          {!isCollapsed && (
                            <div>
                              {treeItems.map((item) => (
                                <NoteListItem
                                  key={item.id}
                                  item={item}
                                  onDelete={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
