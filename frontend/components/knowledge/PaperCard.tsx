"use client"
import {
    BookOpen,
    Calendar,
    ChevronRight,
    ExternalLink,
    FileText,
    Loader2,
    Trash2,
    User
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

export interface PaperItem {
  id: string
  title: string
  summary: string
  source_url: string
  author: string
  key_concepts: string[]
  tags: string[]
  difficulty: number
  reading_time_minutes: number
  importance_score: number
  knowledge_tree: string
  knowledge_domain?: string | null
  created_at: string
  attachments?: {
    id: string
    filename: string
    minio_path: string
    file_type: string
    page_count: number | null
  }[]
}

export function PaperCard({
  item,
  onDelete,
  onRead,
}: {
  item: PaperItem
  onDelete?: (id: string) => void
  onRead?: (id: string) => void
}) {
  const diff = item.difficulty || 0
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm("Are you sure you want to delete this paper?")) return

    setIsDeleting(true)
    try {
      const res = await fetch(`http://localhost:8000/api/knowledge/${item.id}`, {
        method: "DELETE"
      })
      if (res.ok) {
        onDelete?.(item.id)
      } else {
        console.error("Failed to delete paper")
        setIsDeleting(false)
      }
    } catch (err) {
      console.error(err)
      setIsDeleting(false)
    }
  }

  const attachment = item.attachments?.[0]

  return (
    <div className="group relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:border-indigo-500/30 hover:bg-white/[0.05] transition-all duration-300 overflow-hidden">
      {/* Subtle gradient on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-indigo-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
        {/* Paper icon */}
        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
          <FileText size={18} className="text-indigo-400" />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Header row: source + difficulty + actions */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500 font-medium">Research Paper</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {diff > 0 && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${difficultyColor[diff]}`}>
                  {difficultyLabel[diff]}
                </span>
              )}
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-zinc-500 hover:text-red-400 p-1 rounded-md hover:bg-red-400/10 transition-colors disabled:opacity-50"
                title="Delete this paper"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-base font-semibold text-white leading-snug line-clamp-2">
            {item.title || "Untitled Research Paper"}
          </h3>

          {/* Author + reading time + pages */}
          <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
            {item.author && (
              <span className="flex items-center gap-1.5">
                <User size={11} />
                <span className="truncate max-w-[200px]">{item.author}</span>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <BookOpen size={11} />
              {item.reading_time_minutes ? `${item.reading_time_minutes} min read` : "Saved"}
            </span>
            {attachment?.page_count && (
              <span className="flex items-center gap-1.5">
                <FileText size={11} />
                {attachment.page_count} pages
              </span>
            )}
          </div>

          {/* Summary */}
          {item.summary && (
            <p
              className="text-sm text-zinc-400 leading-relaxed line-clamp-2"
              title={item.summary}
            >
              {item.summary}
            </p>
          )}

          {/* Tags */}
          {item.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.slice(0, 6).map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-[11px] bg-indigo-600/10 text-indigo-300
                             rounded-full border border-indigo-600/15"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="hidden sm:flex flex-col gap-2 flex-shrink-0 self-center">
          {attachment && (
            <button
              onClick={() => onRead?.(item.id)}
              className="flex items-center justify-center gap-1.5 w-24 px-3 py-2 rounded-lg text-xs font-medium
                         bg-indigo-500/15 text-indigo-300 border border-indigo-500/25
                         hover:bg-indigo-500/25 hover:text-indigo-200 transition-colors"
            >
              <BookOpen size={13} />
              Read PDF
              <ChevronRight size={13} />
            </button>
          )}
          {item.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-24 px-3 py-2 rounded-lg text-xs font-medium
                         border border-white/[0.08] text-zinc-400
                         hover:text-indigo-300 hover:border-indigo-500/30 transition-colors"
            >
              <ExternalLink size={13} />
              Source
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
