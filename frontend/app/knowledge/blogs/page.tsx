"use client"
import { BlogCard, type BlogItem } from "@/components/knowledge/BlogCard"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/EmptyState"
import { ChevronDown, ChevronRight, Filter, FolderOpen, Globe, RefreshCw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

// Group items by their knowledge tree path (or "Uncategorised")
function groupBySection(items: BlogItem[]): Record<string, BlogItem[]> {
  const groups: Record<string, BlogItem[]> = {}
  for (const item of items) {
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

export default function BlogsPage() {
  const [items, setItems]         = useState<BlogItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const fetchItems = () => {
    setLoading(true)
    setError(false)
    fetch("http://localhost:8000/api/knowledge/blogs")
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

  // Auto-scroll to target if navigating with a hash (e.g. from learning paths)
  useEffect(() => {
    if (items.length > 0 && window.location.hash) {
      setTimeout(() => {
        const el = document.getElementById(window.location.hash.substring(1))
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          el.classList.add("js-glow")
        }
      }, 100)
    }
  }, [items])


  const grouped = useMemo(() => groupBySection(items), [items])
  const sections = Object.keys(grouped).sort()

  const toggleSection = (section: string) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }))
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Page header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-xl bg-orange-500/15 flex items-center justify-center">
                <Globe size={16} className="text-orange-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">Blog Library</h1>
            </div>
            <p className="text-zinc-500 text-sm">
              Articles from Medium, Dev.to, Hashnode, Substack, and personal blogs — summarised and indexed.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {!loading && (
              <span className="text-sm text-zinc-600 hidden sm:block">
                {items.length} {items.length === 1 ? "article" : "articles"}
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
            icon={<Globe size={28} className="text-orange-400" />}
            title="Could not load blog articles"
            description="Make sure the BrainVault backend is running on port 8000."
            hint="Run: uvicorn backend.main:app --reload"
          />
        )}

        {/* Empty state */}
        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={<Globe size={28} className="text-orange-400" />}
            title="No blog articles saved yet"
            description="Paste a Medium, Dev.to, Hashnode, or any blog URL in the dashboard to get started."
            hint="The Blog Agent extracts key concepts, author info, and reading time automatically."
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
                    <div className="w-6 h-6 rounded-lg bg-orange-600/15 flex items-center justify-center flex-shrink-0">
                      <FolderOpen size={12} className="text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-white truncate">{topicLabel}</span>
                      <span className="text-xs text-zinc-600 ml-2">
                        {section !== topicLabel ? `· ${section}` : ""}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-600 flex-shrink-0">
                      {sectionItems.length} {sectionItems.length === 1 ? "article" : "articles"}
                    </span>
                    {isCollapsed
                      ? <ChevronRight size={14} className="text-zinc-600 flex-shrink-0" />
                      : <ChevronDown size={14} className="text-zinc-600 flex-shrink-0" />
                    }
                  </button>

                  {/* Cards list */}
                  {!isCollapsed && (
                    <div className="flex flex-col gap-4">
                      {sectionItems.map(item => (
                        <BlogCard
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
