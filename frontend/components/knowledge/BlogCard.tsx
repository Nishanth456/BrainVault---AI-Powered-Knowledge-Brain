"use client"
import {
    Clock, ExternalLink,
    Globe,
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

export interface BlogItem {
  id: string
  title: string
  summary: string
  source_url?: string
  author?: string
  site?: string
  key_concepts: string[]
  tags: string[]
  difficulty?: number
  reading_time_minutes: number
  importance_score: number
  knowledge_tree?: string
  knowledge_domain?: string | null
  created_at?: string
}

export function BlogCard({ item, onDelete }: { item: BlogItem; onDelete?: (id: string) => void }) {
  const diff = item.difficulty || 0
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this blog?")) return

    setIsDeleting(true)
    try {
      const res = await fetch(`http://localhost:8000/api/knowledge/${item.id}`, {
        method: "DELETE"
      })
      if (res.ok) {
        onDelete?.(item.id)
      } else {
        console.error("Failed to delete blog")
        setIsDeleting(false)
      }
    } catch (e) {
      console.error(e)
      setIsDeleting(false)
    }
  }

  return (
    <a
      id={`item-${item.id}`}
      href={item.source_url || "#"}
      target={item.source_url ? "_blank" : undefined}
      rel={item.source_url ? "noopener noreferrer" : undefined}
      className="group block relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:border-orange-500/30 hover:bg-white/[0.05] transition-all duration-300 overflow-hidden target-glow-orange"
    >
      {/* Subtle gradient on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-orange-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
        {/* Site icon */}
        <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center flex-shrink-0">
          <Globe size={18} className="text-orange-400" />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Header row: site + difficulty + delete */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500 font-medium">{item.site || "Blog"}</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {diff > 0 && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${difficultyColor[diff]}`}>
                  {difficultyLabel[diff]}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleDelete()
                }}
                disabled={isDeleting}
                className="text-zinc-500 hover:text-red-400 p-1 rounded-md hover:bg-red-400/10 transition-colors disabled:opacity-50"
                title="Delete this blog"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-base font-semibold text-white leading-snug line-clamp-2">
            {item.title || "Untitled Blog Post"}
          </h3>

          {/* Author + reading time */}
          <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
            {item.author && (
              <span className="flex items-center gap-1.5">
                <User size={11} />
                <span className="truncate max-w-[200px]">{item.author}</span>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock size={11} />
              {item.reading_time_minutes ? `${item.reading_time_minutes} min read` : "Saved"}
            </span>
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
                  className="px-2 py-0.5 text-[11px] bg-orange-600/10 text-orange-300
                             rounded-full border border-orange-600/15"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* External link arrow */}
        {item.source_url && (
          <div className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg border border-white/[0.08]
                          text-zinc-500 group-hover:text-orange-300 group-hover:border-orange-500/30
                          transition-colors flex-shrink-0 self-center">
            <ExternalLink size={15} />
          </div>
        )}
      </div>
    </a>
  )
}
