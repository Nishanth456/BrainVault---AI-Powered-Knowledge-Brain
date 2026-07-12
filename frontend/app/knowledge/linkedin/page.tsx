"use client"
import { useEffect, useState, useMemo } from "react"
import { LinkedInCard, type LinkedInItem } from "@/components/knowledge/LinkedInCard"
import { EmptyState } from "@/components/ui/EmptyState"
import { Filter, RefreshCw, FolderOpen, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

// Group items by their top-level knowledge tree segment (e.g. "AI > X > Y" → "AI")
function groupBySection(items: LinkedInItem[]): Record<string, LinkedInItem[]> {
  const groups: Record<string, LinkedInItem[]> = {}
  for (const item of items) {
    // Use full tree path as section key, or "Uncategorised"
    const section = item.knowledge_tree || "Uncategorised"
    if (!groups[section]) groups[section] = []
    groups[section].push(item)
  }
  return groups
}

// Extract the leaf topic from a tree path (last segment after ">")
function leafTopic(treePath: string): string {
  const parts = treePath.split(">")
  return parts[parts.length - 1].trim()
}

export default function LinkedInPage() {
  const [items, setItems]         = useState<LinkedInItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const fetchItems = () => {
    setLoading(true)
    setError(false)
    fetch("http://localhost:8000/api/knowledge/linkedin")
      .then(r => {
        if (!r.ok) throw new Error("API error")
        return r.json()
      })
      .then(data => {
        setItems(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }

  useEffect(() => { fetchItems() }, [])

  const grouped = useMemo(() => groupBySection(items), [items])
  const sections = Object.keys(grouped).sort()

  const toggleSection = (section: string) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const LinkedInLogo = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[#0077B5]">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  )

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Page header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-xl bg-[#0077B5]/15 flex items-center justify-center">
                <LinkedInLogo />
              </div>
              <h1 className="text-2xl font-bold text-white">LinkedIn Knowledge</h1>
            </div>
            <p className="text-zinc-500 text-sm">
              Posts, articles, and PDF carousels — intelligently extracted and organised.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {!loading && (
              <span className="text-sm text-zinc-600 hidden sm:block">
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
            )}
            <Button
              variant="outline" size="sm"
              onClick={fetchItems}
              className="border-white/10 text-zinc-400 hover:text-white h-8"
            >
              <RefreshCw size={13} className="mr-1.5" />
              Refresh
            </Button>
            <Button
              variant="outline" size="sm"
              className="border-white/10 text-zinc-400 hover:text-white h-8"
            >
              <Filter size={13} className="mr-1.5" />
              Filter
            </Button>
          </div>
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-8">
            {[...Array(2)].map((_, si) => (
              <div key={si}>
                <div className="h-5 w-48 bg-white/[0.05] rounded-lg animate-pulse mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-72 bg-white/[0.03] rounded-2xl animate-pulse border border-white/[0.05]" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <EmptyState
            icon={<LinkedInLogo />}
            title="Could not load LinkedIn posts"
            description="Make sure the BrainVault backend is running on port 8000."
            hint="Run: uvicorn backend.main:app --reload"
          />
        )}

        {/* Empty state */}
        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={<LinkedInLogo />}
            title="No LinkedIn posts saved yet"
            description="Paste a LinkedIn post URL in the dashboard and add a concept label to get started."
            hint="Tip: Add your LinkedIn credentials to backend/.env for authenticated scraping — this enables PDF carousel downloads."
          />
        )}

        {/* Grouped sections */}
        {!loading && !error && sections.length > 0 && (
          <div className="space-y-8">
            {sections.map(section => {
              const sectionItems = grouped[section]
              const isCollapsed = collapsed[section]
              const topicLabel = leafTopic(section)

              return (
                <div key={section}>
                  {/* Section header */}
                  <button
                    onClick={() => toggleSection(section)}
                    className="flex items-center gap-2.5 mb-4 group w-full text-left"
                  >
                    <div className="w-6 h-6 rounded-lg bg-violet-600/15 flex items-center justify-center flex-shrink-0">
                      <FolderOpen size={12} className="text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-white truncate">{topicLabel}</span>
                      <span className="text-xs text-zinc-600 ml-2">
                        {section !== topicLabel ? `· ${section}` : ""}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-600 flex-shrink-0">
                      {sectionItems.length} {sectionItems.length === 1 ? "post" : "posts"}
                    </span>
                    {isCollapsed
                      ? <ChevronRight size={14} className="text-zinc-600 flex-shrink-0" />
                      : <ChevronDown size={14} className="text-zinc-600 flex-shrink-0" />
                    }
                  </button>

                  {/* Cards grid */}
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {sectionItems.map(item => (
                        <LinkedInCard 
                          key={item.id} 
                          item={item} 
                          onDelete={(id) => setItems(prev => prev.filter(i => i.id !== id))}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
