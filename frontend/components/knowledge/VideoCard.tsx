/* eslint-disable @next/next/no-img-element */
"use client"
import {
    Clock,
    ExternalLink,
        Play,
        User,
} from "lucide-react"
import { BookmarkButton } from "@/components/knowledge/BookmarkButton"
import { DeleteWithUndo } from "@/components/knowledge/DeleteWithUndo"
import { ExportButton } from "@/components/knowledge/ExportButton"
import { restoreItem } from "@/lib/api"
import { useRouter } from "next/navigation"

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
  attachments?: import("@/components/knowledge/ExportButton").Attachment[]
}

/**
 * Extract YouTube video ID from any YouTube URL.
 */
function extractVideoId(url?: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.hostname === "youtu.be" || parsed.hostname === "www.youtu.be") {
      return parsed.pathname.split("/")[1] || null
    }
    if (
      parsed.hostname === "youtube.com" ||
      parsed.hostname === "www.youtube.com" ||
      parsed.hostname === "m.youtube.com"
    ) {
      return parsed.searchParams.get("v") || null
    }
  } catch {
    // not a valid URL
  }
  return null
}

/**
 * Get the best thumbnail URL for a YouTube video.
 * Priority: YouTube CDN (free, no API key) → MinIO stored path → null
 */
function getThumbnailUrl(item: VideoItem): string | null {
  const videoId = extractVideoId(item.source_url)
  if (videoId) {
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  }
  if (item.thumbnail_path) {
    return `http://127.0.0.1:8000/api/files/${item.thumbnail_path}`
  }
  return null
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
  }: {
  item: VideoItem
  onDelete?: (id: string) => void
  onOpen?: (id: string) => void
}) {
  const diff = item.difficulty || 0
    const router = useRouter()
  const thumbnailUrl = getThumbnailUrl(item)

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm("Are you sure you want to delete this video?")) return

    setIsDeleting(true)
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/knowledge/${item.id}`, {
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

  const handleClick = () => {
    router.push(`/knowledge/youtube/${item.id}`)
  }

  const chapterCount = item.chapters?.length || 0

  return (
    <div
      onClick={handleClick}
      className="group relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 hover:border-red-500/30 hover:bg-white/[0.05] transition-all duration-300 overflow-hidden cursor-pointer"
    >
      {/* Subtle gradient on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-red-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      <div className="relative flex gap-4">
        {/* Thumbnail */}
        <div className="w-32 sm:w-44 flex-shrink-0 aspect-video rounded-xl bg-zinc-800 border border-white/[0.08] overflow-hidden relative group/thumb">
          {thumbnailUrl ? (
            <>
              <img
                src={thumbnailUrl}
                alt={item.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-105"
              />
              {/* Play overlay on hover */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-300 bg-black/30">
                <div className="w-10 h-10 rounded-full bg-red-600/90 flex items-center justify-center shadow-lg shadow-red-600/20">
                  <Play size={16} className="text-white ml-0.5" fill="white" />
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-red-500/10">
              <Play size={20} className="text-red-400" />
            </div>
          )}
          {item.video_duration_seconds && (
            <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-white font-medium backdrop-blur-sm">
              {formatDuration(item.video_duration_seconds)}
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {/* Header row: channel + difficulty + actions */}
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
              <ExportButton attachments={item.attachments} />
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
          <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all duration-300">
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
