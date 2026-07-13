"use client"
import { VideoCard, type VideoItem } from "@/components/knowledge/VideoCard"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/EmptyState"
import { ChevronDown, ChevronRight, Filter, FolderOpen, PlayCircle, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

function groupBySection(items: VideoItem[]): Record<string, VideoItem[]> {
  const groups: Record<string, VideoItem[]> = {}
  for (const item of items) {
    const section = item.knowledge_tree || "Uncategorised"
    if (!groups[section]) groups[section] = []
    groups[section].push(item)
  }
  return groups
}

function leafTopic(treePath: string): string {
  const parts = treePath.split(">")
  return parts[parts.length - 1].trim()
}

export default function YouTubePage() {
  const router = useRouter()
  const [items, setItems]         = useState<VideoItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const fetchItems = () => {
    setLoading(true)
    setError(false)
    fetch("http://localhost:8000/api/knowledge/youtube")
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

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Page header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-xl bg-red-500/15 flex items-center justify-center">
                <PlayCircle size={16} className="text-red-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">YouTube Library</h1>
            </div>
            <p className="text-zinc-500 text-sm">
              Saved videos and playlists — transcribed, chapter-summarised, and indexed for semantic search.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {!loading && (
              <span className="text-sm text-zinc-600 hidden sm:block">
                {items.length} {items.length === 1 ? "video" : "videos"}
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
                <div className="grid grid-cols-1 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-36 bg-white/[0.03] rounded-2xl animate-pulse border border-white/[0.05]" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <EmptyState
            icon={<PlayCircle size={28} className="text-red-400" />}
            title="Could not load videos"
            description="The backend may be unavailable or the YouTube endpoint failed."
            action={
              <Button variant="outline" onClick={fetchItems} className="border-white/10 text-zinc-400 hover:text-white">
                <RefreshCw size={14} className="mr-2" />
                Try again
              </Button>
            }
          />
        )}

        {/* Empty state */}
        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={<FolderOpen size={28} className="text-zinc-500" />}
            title="No videos yet"
            description="Paste a YouTube video or playlist URL in the universal input to start indexing."
          />
        )}

        {/* Grouped video cards */}
        {!loading && !error && items.length > 0 && (
          <div className="space-y-8">
            {sections.map(section => {
              const isCollapsed = collapsed[section]
              return (
                <div key={section}>
                  <button
                    onClick={() => toggleSection(section)}
                    className="flex items-center gap-2 mb-4 group"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={16} className="text-zinc-500 group-hover:text-white transition-colors" />
                    ) : (
                      <ChevronDown size={16} className="text-zinc-500 group-hover:text-white transition-colors" />
                    )}
                    <h2 className="text-sm font-semibold text-zinc-300 tracking-wide">
                      {leafTopic(section)}
                    </h2>
                    <span className="text-xs text-zinc-600 ml-1">({grouped[section].length})</span>
                  </button>

                  {!isCollapsed && (
                    <div className="grid grid-cols-1 gap-4">
                      {grouped[section].map(item => (
                        <VideoCard
                          key={item.id}
                          item={item}
                          onDelete={(id) => setItems(prev => prev.filter(i => i.id !== id))}
                          onOpen={(id) => router.push(`/knowledge/youtube/${id}`)}
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
