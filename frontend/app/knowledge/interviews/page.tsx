"use client"
import { useEffect, useState, useMemo } from "react"
import { LinkedInCard, type LinkedInItem } from "@/components/knowledge/LinkedInCard"
import { QnACard } from "@/components/knowledge/QnACard"
import { EmptyState } from "@/components/ui/EmptyState"
import { Filter, RefreshCw, FolderOpen, ChevronDown, ChevronRight, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"

// Group items by their original source, then by topic
function groupItems(items: LinkedInItem[]) {
  const sources: Record<string, Record<string, LinkedInItem[]>> = {}
  for (const item of items) {
    const source = item.knowledge_domain || "Plain Text"
    const topic = item.knowledge_tree || "Uncategorized"
    
    if (!sources[source]) sources[source] = {}
    if (!sources[source][topic]) sources[source][topic] = []
    
    sources[source][topic].push(item)
  }
  return sources
}

export default function InterviewPage() {
  const [items, setItems]         = useState<LinkedInItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(false)
  const [collapsedTopics, setCollapsedTopics] = useState<Record<string, boolean>>({})

  const fetchItems = () => {
    setLoading(true)
    setError(false)
    fetch("http://localhost:8000/api/knowledge/interview")
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


  const grouped = useMemo(() => groupItems(items), [items])
  const sources = Object.keys(grouped).sort()

  const toggleTopic = (topicKey: string) => {
    setCollapsedTopics(prev => ({ ...prev, [topicKey]: !prev[topicKey] }))
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Page header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-xl bg-violet-600/15 flex items-center justify-center">
                <MessageSquare size={16} className="text-violet-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">Interview QnA</h1>
            </div>
            <p className="text-zinc-500 text-sm">
              Interview questions, answers, and preparation material automatically intercepted from your inputs.
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
            icon={<MessageSquare size={24} className="text-violet-400" />}
            title="Could not load Interview QnA"
            description="Make sure the BrainVault backend is running on port 8000."
            hint="Run: uvicorn backend.main:app --reload"
          />
        )}

        {/* Empty state */}
        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={<MessageSquare size={24} className="text-violet-400" />}
            title="No Interview QnA saved yet"
            description="When you ingest content (like LinkedIn posts) that contains interview questions, it will automatically appear here."
            hint="Try pasting a LinkedIn post about system design interview questions."
          />
        )}

        {/* Grouped sections */}
        {!loading && !error && sources.length > 0 && (
          <div className="space-y-12">
            {sources.map(source => {
              const topics = Object.keys(grouped[source]).sort()

              return (
                <div key={source} className="bg-white/[0.02] rounded-2xl border border-white/[0.05] p-6 sm:p-8">
                  {/* Source header */}
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/[0.05]">
                    <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center">
                      <FolderOpen size={16} className="text-violet-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white">{source}</h2>
                  </div>

                  <div className="space-y-8">
                    {topics.map(topic => {
                      const topicItems = grouped[source][topic]
                      const topicKey = `${source}-${topic}`
                      const isCollapsed = collapsedTopics[topicKey]

                      return (
                        <div key={topic}>
                          {/* Topic header */}
                          <button
                            onClick={() => toggleTopic(topicKey)}
                            className="flex items-center gap-2.5 mb-4 group w-full text-left hover:bg-white/[0.02] p-2 -ml-2 rounded-lg transition-colors"
                          >
                            <div className="w-5 h-5 rounded bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                              <MessageSquare size={10} className="text-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-semibold text-white/90 truncate">{topic}</span>
                            </div>
                            <span className="text-xs text-zinc-500 flex-shrink-0">
                              {topicItems.length} {topicItems.length === 1 ? "item" : "items"}
                            </span>
                            {isCollapsed
                              ? <ChevronRight size={14} className="text-zinc-600 flex-shrink-0" />
                              : <ChevronDown size={14} className="text-zinc-600 flex-shrink-0" />
                            }
                          </button>

                          {/* Content */}
                          {!isCollapsed && (
                            <div className="space-y-6 mt-4">
                              {/* PDF Cards Grid */}
                              {topicItems.some(item => item.attachments && item.attachments.some(a => a.file_type === "pdf")) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {topicItems
                                    .filter(item => item.attachments && item.attachments.some(a => a.file_type === "pdf"))
                                    .map(item => (
                                      <LinkedInCard 
                                        key={item.id} 
                                        item={item} 
                                        onDelete={(id) => setItems(prev => prev.filter(i => i.id !== id))}
                                      />
                                    ))}
                                </div>
                              )}

                              {/* Text-only QnA List (Full width) */}
                              {topicItems.some(item => !(item.attachments && item.attachments.some(a => a.file_type === "pdf"))) && (
                                <div className="flex flex-col gap-4">
                                  {topicItems
                                    .filter(item => !(item.attachments && item.attachments.some(a => a.file_type === "pdf")))
                                    .map(item => (
                                      <QnACard 
                                        key={item.id} 
                                        item={item} 
                                      />
                                    ))}
                                </div>
                              )}
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
