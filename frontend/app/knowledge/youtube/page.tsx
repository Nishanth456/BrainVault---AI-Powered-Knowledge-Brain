"use client"
import { KnowledgePageShell } from "@/components/knowledge/KnowledgePageShell"
import { VideoCard, type VideoItem } from "@/components/knowledge/VideoCard"
import { PlayCircle } from "lucide-react"

export default function YoutubePage() {
  const fetchItems = async (filters: Record<string, string>, sort: string) => {
    const params = new URLSearchParams(filters)
    params.set("sort", sort)
    const res = await fetch(`http://localhost:8000/api/knowledge/youtube?${params.toString()}`)
    if (!res.ok) throw new Error("Failed to fetch")
    const data = await res.json()
    return Array.isArray(data) ? data : (data.items || [])
  }

  return (
    <KnowledgePageShell<VideoItem>
      title="YouTube Library"
      subtitle="Saved videos and playlists — transcribed, chapter-summarised, and indexed for semantic search."
      icon={
        <div className="w-8 h-8 rounded-xl bg-red-500/15 flex items-center justify-center">
          <PlayCircle size={16} className="text-red-400" />
        </div>
      }
      emptyIcon={<PlayCircle size={24} className="text-muted-foreground/50" />}
      emptyTitle="No videos found"
      emptyDescription="You haven't saved any YouTube videos yet, or none match your filters."
      emptyHint="Paste a YouTube link in the dashboard to add one."
      fetchItems={fetchItems}
      renderCard={(item, onDelete) => <VideoCard key={item.id} item={item} onDelete={onDelete} />}
      getItemId={(item) => item.id}
      
      singleColumn={true}
    />
  )
}
