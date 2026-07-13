"use client"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/EmptyState"
import { ArrowLeft, Clock, ExternalLink, PlayCircle, User } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"

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
}

function formatDuration(seconds?: number | null): string {
  if (!seconds) return ""
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  return `${m}:${s.toString().padStart(2, "0")}`
}

const difficultyLabel = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert"]

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [item, setItem] = useState<VideoDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(false)
    fetch(`http://localhost:8000/api/knowledge/${id}`)
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

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-4xl mx-auto">
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
      <div className="p-6 sm:p-8 max-w-4xl mx-auto">
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

  const chapters = item.chapters || []

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/knowledge/youtube" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white mb-6 transition-colors">
          <ArrowLeft size={14} />
          Back to YouTube Library
        </Link>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3">
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
            {item.difficulty && item.difficulty > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.06] text-zinc-300">
                {difficultyLabel[item.difficulty]}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-3">
            {item.title}
          </h1>
          <p className="text-zinc-400 leading-relaxed">
            {item.summary}
          </p>
        </div>

        {/* Thumbnail */}
        <div className="aspect-video rounded-2xl overflow-hidden border border-white/[0.08] bg-zinc-900 mb-8">
          {item.thumbnail_path ? (
            <img
              src={`http://localhost:8000/${item.thumbnail_path}`}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-red-500/10">
              <PlayCircle size={48} className="text-red-400/50" />
            </div>
          )}
        </div>

        {/* Chapters */}
        {chapters.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Chapters</h2>
            <div className="space-y-3">
              {chapters.map((chapter, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-red-500/20 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs font-medium text-red-400/80 px-2 py-0.5 rounded bg-red-500/10">
                      {formatDuration(chapter.start_seconds)}
                    </span>
                    <h3 className="text-sm font-semibold text-zinc-200">{chapter.title}</h3>
                  </div>
                  {chapter.summary && (
                    <p className="text-sm text-zinc-500 leading-relaxed pl-[52px]">{chapter.summary}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Concepts */}
        {item.key_concepts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-3">Key Concepts</h2>
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

        {/* Transcript */}
        {item.transcript && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-3">Transcript</h2>
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] max-h-96 overflow-y-auto">
              <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{item.transcript}</p>
            </div>
          </div>
        )}

        {/* Open on YouTube */}
        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            <ExternalLink size={14} />
            Open on YouTube
          </a>
        )}
      </div>
    </div>
  )
}
