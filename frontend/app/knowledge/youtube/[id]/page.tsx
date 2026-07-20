/* eslint-disable @next/next/no-img-element */
"use client"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/EmptyState"
import { BookmarkButton } from "@/components/knowledge/BookmarkButton"
import { ExportButton } from "@/components/knowledge/ExportButton"
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Maximize,
  Minimize,
  Play,
  PlayCircle,
  User,
  ListVideo,
  Sparkles,
  Tag,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

interface VideoChapter {
  start_seconds?: number
  title?: string
  summary?: string
}

interface VideoDetail {
  id: string
  title: string
  summary: string
  source_url?: string
  author?: string
  key_concepts: string[]
  tags: string[]
  difficulty?: number
  knowledge_tree?: string
  knowledge_domain?: string | null
  created_at?: string
  video_duration_seconds?: number | null
  channel_name?: string | null
  thumbnail_path?: string | null
  chapters?: VideoChapter[]
  transcript?: string | null
  playlist_id?: string | null
  is_bookmarked?: boolean
}

function formatDuration(seconds?: number | null): string {
  if (!seconds) return ""
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  return `${m}:${s.toString().padStart(2, "0")}`
}

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

function extractPlaylistId(url?: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get("list") || null
  } catch {
    return null
  }
}

const difficultyLabel = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert"]
const difficultyColor = [
  "",
  "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  "text-blue-400   bg-blue-400/10   border-blue-400/20",
  "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  "text-orange-400 bg-orange-400/10 border-orange-400/20",
  "text-red-400    bg-red-400/10    border-red-400/20",
]

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [item, setItem] = useState<VideoDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [startSeconds, setStartSeconds] = useState(0)
  const [showTranscript, setShowTranscript] = useState(false)

  const playerContainerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(false)
    fetch(`http://127.0.0.1:8000/api/knowledge/${id}`)
      .then(r => {
        if (!r.ok) throw new Error("API error")
        return r.json()
      })
      .then(data => {
        setItem(data)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [id])

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", handleFsChange)
    return () => document.removeEventListener("fullscreenchange", handleFsChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!playerContainerRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      playerContainerRef.current.requestFullscreen()
    }
  }, [])

  const handlePlay = useCallback((startAt = 0) => {
    setStartSeconds(startAt)
    setIsPlaying(true)
  }, [])

  const handleChapterClick = useCallback((seconds: number) => {
    setStartSeconds(seconds)
    setIsPlaying(true)
    // Scroll to player
    playerContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-white/[0.05] rounded-lg animate-pulse mb-6" />
        <div className="aspect-video bg-white/[0.03] rounded-2xl animate-pulse border border-white/[0.05] mb-6" />
        <div className="space-y-3">
          <div className="h-4 w-full bg-white/[0.05] rounded animate-pulse" />
          <div className="h-4 w-5/6 bg-white/[0.05] rounded animate-pulse" />
          <div className="h-4 w-4/6 bg-white/[0.05] rounded animate-pulse" />
        </div>
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="p-6 sm:p-8 max-w-5xl mx-auto">
        <EmptyState
          icon={<PlayCircle size={28} className="text-red-400" />}
          title="Could not load video"
          description="The video details could not be fetched."
          action={
            <Link href="/knowledge/youtube">
              <Button variant="outline" className="border-white/10 text-zinc-400 hover:text-white">
                <ArrowLeft size={14} className="mr-2" />
                Back to YouTube Library
              </Button>
            </Link>
          }
        />
      </div>
    )
  }

  const videoId = extractVideoId(item.source_url)
  const playlistId = extractPlaylistId(item.source_url)
  const chapters = item.chapters || []
  const thumbnailUrl = videoId
    ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    : item.thumbnail_path
      ? `http://127.0.0.1:8000/api/files/${item.thumbnail_path}`
      : null
  const diff = item.difficulty || 0

  // Build embed URL
  const buildEmbedUrl = () => {
    if (playlistId && !videoId) {
      return `https://www.youtube.com/embed/videoseries?list=${playlistId}&autoplay=1`
    }
    if (!videoId) return null
    const params = new URLSearchParams({
      autoplay: "1",
      rel: "0",
      modestbranding: "1",
    })
    if (startSeconds > 0) params.set("start", String(startSeconds))
    if (playlistId) params.set("list", playlistId)
    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
  }

  const embedUrl = buildEmbedUrl()

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Back link */}
        <Link href="/knowledge/youtube" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white mb-6 transition-colors">
          <ArrowLeft size={14} />
          Back to YouTube Library
        </Link>

        {/* ── Video Player ─────────────────────────────────────────── */}
        <div
          ref={playerContainerRef}
          className={`relative rounded-2xl overflow-hidden border border-white/[0.08] bg-black mb-8 transition-all duration-300 ${
            isFullscreen ? "rounded-none border-none" : ""
          }`}
        >
          {isPlaying && embedUrl ? (
            /* Embedded YouTube iframe */
            <div className={`relative w-full ${isFullscreen ? "h-screen" : "aspect-video"}`}>
              <iframe
                ref={iframeRef}
                src={embedUrl}
                title={item.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
              {/* Fullscreen toggle overlay */}
              <button
                onClick={toggleFullscreen}
                className="absolute top-3 right-3 z-20 p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white/70 hover:text-white transition-all backdrop-blur-sm border border-white/10"
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
            </div>
          ) : (
            /* Click-to-play thumbnail overlay */
            <div
              className="relative aspect-video cursor-pointer group/player"
              onClick={() => handlePlay(0)}
            >
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover/player:scale-[1.02]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-950/40 to-zinc-900">
                  <PlayCircle size={64} className="text-red-400/30" />
                </div>
              )}
              {/* Dark gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
              {/* Central play button */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-red-600/90 flex items-center justify-center shadow-2xl shadow-red-600/30 group-hover/player:scale-110 transition-transform duration-300 backdrop-blur-sm">
                  <Play size={32} className="text-white ml-1" fill="white" />
                </div>
              </div>
              {/* Duration badge */}
              {item.video_duration_seconds && (
                <div className="absolute bottom-4 right-4 px-3 py-1 rounded-lg bg-black/70 text-sm text-white font-medium backdrop-blur-sm border border-white/10">
                  {formatDuration(item.video_duration_seconds)}
                </div>
              )}
              {/* "Click to play" hint */}
              <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg bg-black/50 text-xs text-white/70 backdrop-blur-sm border border-white/5 opacity-0 group-hover/player:opacity-100 transition-opacity duration-300">
                Click to play
              </div>
            </div>
          )}
        </div>

        {/* ── Video Info ───────────────────────────────────────────── */}
        <div className="mb-8">
          {/* Channel & meta row */}
          <div className="flex items-center gap-3 text-xs text-zinc-500 mb-3 flex-wrap">
            <span className="flex items-center gap-1.5">
              <User size={11} />
              {item.channel_name || item.author || "YouTube"}
            </span>
            {item.video_duration_seconds && (
              <span className="flex items-center gap-1.5">
                <Clock size={11} />
                {formatDuration(item.video_duration_seconds)}
              </span>
            )}
            {diff > 0 && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${difficultyColor[diff]}`}>
                {difficultyLabel[diff]}
              </span>
            )}
            {item.knowledge_domain && (
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-zinc-400">
                {item.knowledge_domain}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-3">
            {item.title}
          </h1>

          {/* Summary */}
          <p className="text-zinc-400 leading-relaxed mb-4">
            {item.summary}
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            {item.source_url && (
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600/10 text-red-400 hover:bg-red-600/20 border border-red-600/20 hover:border-red-500/40 transition-all text-sm font-medium"
              >
                <ExternalLink size={14} />
                Open on YouTube
              </a>
            )}
            <BookmarkButton itemId={item.id} initial={item.is_bookmarked || false} />
            <ExportButton itemId={item.id} title={item.title || "Export"} />
          </div>
        </div>

        {/* ── Two-column layout: chapters + info ───────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Chapters */}
          {chapters.length > 0 && (
            <div className="lg:col-span-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
                <ListVideo size={18} className="text-red-400" />
                Chapters
                <span className="text-xs text-zinc-500 font-normal ml-1">({chapters.length})</span>
              </h2>
              <div className="space-y-2">
                {chapters.map((chapter, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleChapterClick(chapter.start_seconds || 0)}
                    className="w-full text-left p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-red-500/25 hover:bg-white/[0.05] transition-all duration-200 group/ch"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono text-red-400/80 px-2 py-1 rounded-lg bg-red-500/10 group-hover/ch:bg-red-500/20 transition-colors">
                          <Play size={10} className="text-red-400" fill="currentColor" />
                          {formatDuration(chapter.start_seconds)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-zinc-200 group-hover/ch:text-white transition-colors">
                          {chapter.title}
                        </h3>
                        {chapter.summary && (
                          <p className="text-xs text-zinc-500 leading-relaxed mt-1 line-clamp-2">
                            {chapter.summary}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Right: Concepts & Tags */}
          <div className={`${chapters.length > 0 ? "lg:col-span-1" : "lg:col-span-3"} space-y-6`}>
            {/* Key Concepts */}
            {item.key_concepts.length > 0 && (
              <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
                  <Sparkles size={14} className="text-violet-400" />
                  Key Concepts
                </h2>
                <div className="flex flex-wrap gap-2">
                  {item.key_concepts.map(concept => (
                    <span
                      key={concept}
                      className="text-xs px-3 py-1 rounded-full bg-red-500/10 text-red-300/80 border border-red-500/15"
                    >
                      {concept}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {item.tags && item.tags.length > 0 && (
              <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
                  <Tag size={14} className="text-blue-400" />
                  Tags
                </h2>
                <div className="flex flex-wrap gap-2">
                  {item.tags.map(tag => (
                    <span
                      key={tag}
                      className="text-xs px-3 py-1 rounded-full bg-blue-500/10 text-blue-300/80 border border-blue-500/15"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Knowledge Tree */}
            {item.knowledge_tree && (
              <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                <h2 className="text-sm font-semibold text-white mb-2">Knowledge Tree</h2>
                <p className="text-xs text-zinc-400">{item.knowledge_tree}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Transcript ──────────────────────────────────────────── */}
        {item.transcript && (
          <div className="mt-8">
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="flex items-center gap-2 text-sm font-semibold text-white mb-4 hover:text-red-400 transition-colors"
            >
              <ListVideo size={16} />
              Transcript
              <span className="text-xs text-zinc-500 font-normal">
                {showTranscript ? "(click to hide)" : "(click to show)"}
              </span>
            </button>
            {showTranscript && (
              <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] max-h-96 overflow-y-auto">
                <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{item.transcript}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
