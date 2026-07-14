"use client"
import {
    Clock,
    ExternalLink,
    Loader2,
    Play,
    Trash2,
    User,
} from "lucide-react"
import { useState } from "react"

const difficultyLabel = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert"]
const difficultyColor = [
  "",
  "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  "text-blue-400   bg-blue-400/10   border-blue-400/20",
  "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  "text-orange-400 bg-orange-400/10 border-orange-400/20",
  "text-red-400    bg-red-400/10    border-red-400/20",
]

export interface VideoChapter {
  start_seconds?: number
  title?: string
  summary?: string
}

export interface VideoItem {
  is_bookmarked?: boolean
  id: string
  title: string
  summary: string
  source_url?: string
  author?: string
  key_concepts: string[]
  tags: string[]
  difficulty?: number
  reading_time_minutes?: number
  importance_score: number
  knowledge_tree?: string
  knowledge_domain?: string | null
  created_at?: string
  video_duration_seconds?: number | null
  channel_name?: string | null
  thumbnail_path?: string | null
  chapters?: VideoChapter[]
  transcript?: string | null
  playlist_id?: string | null
}

function formatDuration(seconds?: number | null): string {
  if (!seconds) return ""
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function VideoCard({
  item,
  onDelete,
  onOpen,
}: {
  item: VideoItem
  onDelete?: (id: string) => void
  onOpen?: (id: string) => void
}) {
  const diff = item.difficulty || 0
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm("Are you sure you want to delete this video?")) return

    setIsDeleting(true)
    try {
      const res = await fetch(`http://localhost:8000/api/knowledge/${item.id}`, {
        method: "DELETE"
      })
      if (res.ok) {
        onDelete?.(item.id)
      } else {
        console.error("Failed to delete video")
        setIsDeleting(false)
      }
    } catch (err) {
      console.error(err)
      setIsDeleting(false)
    }
  }

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onOpen?.(item.id)
  }

  const chapterCount = item.chapters?.length || 0

  return (
    <div
      onClick={handleOpen}
      className="group relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 hover:border-red-500/30 hover:bg-white/[0.05] transition-all duration-300 overflow-hidden cursor-pointer"
    >
      {/* Subtle gradient on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-red-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      <div className="relative flex gap-4">
        {/* Thumbnail */}
        <div className="w-32 sm:w-40 flex-shrink-0 aspect-video rounded-xl bg-zinc-800 border border-white/[0.08] overflow-hidden relative">
          {item.thumbnail_path ? (
            <img
              src={`http://localhost:8000/${item.thumbnail_path}`}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-red-500/10">
              <Play size={20} className="text-red-400" />
            </div>
          )}
          {item.video_duration_seconds && (
            <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white font-medium">
              {formatDuration(item.video_duration_seconds)}
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {/* Header row: channel + difficulty + delete */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500 font-medium truncate">
              {item.channel_name || "YouTube"}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {diff > 0 && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${difficultyColor[diff]}`}>
                  {difficultyLabel[diff]}
                </span>
              )}
              <div className="flex items-center gap-2">
              <BookmarkButton itemId={item.id} initial={item.is_bookmarked || false} />
              <ExportButton itemId={item.id} title={item.title || "Export"} />
              <DeleteWithUndo
                itemId={item.id}
                itemTitle={item.title || ""}
                onDelete={onDelete!}
                onUndo={async (id) => {
                  await restoreItem(id)
                }}
              />
            </div>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-base font-semibold text-white leading-snug line-clamp-2">
            {item.title || "Untitled Video"}
          </h3>

          {/* Summary */}
          <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2">
            {item.summary || "No summary available."}
          </p>

          {/* Footer: meta + chapters + link */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
              {item.author && (
                <span className="flex items-center gap-1.5">
                  <User size={11} />
                  <span className="truncate max-w-[120px]">{item.author}</span>
                </span>
              )}
              {item.video_duration_seconds && (
                <span className="flex items-center gap-1.5">
                  <Clock size={11} />
                  {formatDuration(item.video_duration_seconds)}
                </span>
              )}
              {chapterCount > 0 && (
                <span className="text-red-300/70">{chapterCount} chapters</span>
              )}
            </div>
            {item.source_url && (
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0"
              >
                <ExternalLink size={13} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
