"use client"
import { useState } from "react"
import Link from "next/link"
import {
  Clock, BookOpen, ExternalLink, User, Globe, ChevronRight, Trash2, Loader2
} from "lucide-react"

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
  source_url: string
  author: string
  site?: string
  key_concepts: string[]
  tags: string[]
  difficulty: number
  reading_time_minutes: number
  importance_score: number
  knowledge_tree: string
  knowledge_domain?: string | null
  created_at: string
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
    <div className="group relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5
                    hover:border-orange-500/30 hover:bg-white/[0.05] transition-all duration-300
                    flex flex-col gap-3.5 overflow-hidden">

      {/* Subtle gradient on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300
                      bg-gradient-to-br from-orange-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
            <Globe size={13} className="text-orange-400" />
          </div>
          <span className="text-xs text-zinc-500 font-medium">{item.site || "Blog"}</span>
        </div>

        <div className="flex items-center gap-2">
          {diff > 0 && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${difficultyColor[diff]}`}>
              {difficultyLabel[diff]}
            </span>
          )}

          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-zinc-500 hover:text-red-400 p-1 rounded-md hover:bg-red-400/10 transition-colors disabled:opacity-50"
            title="Delete this blog"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2 -mb-1">
        {item.title || "Untitled Blog Post"}
      </h3>

      {/* Author */}
      {item.author && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <User size={11} />
          <span className="truncate">{item.author}</span>
        </div>
      )}

      {/* Summary */}
      <p
        className="text-xs text-zinc-400 leading-relaxed line-clamp-2"
        title={item.summary}
      >
        {item.summary}
      </p>

      {/* Tags */}
      {item.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.slice(0, 4).map(tag => (
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

      {/* Knowledge tree */}
      {item.knowledge_tree && (
        <div className="flex items-center gap-1 text-[11px] text-zinc-600 truncate">
          <ChevronRight size={10} className="flex-shrink-0" />
          <span className="truncate">{item.knowledge_tree}</span>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/[0.05]">
        <Link
          href={`/knowledge/blogs/${item.id}/reader`}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium
                     bg-orange-600/20 hover:bg-orange-600/35 text-orange-300 hover:text-orange-200
                     rounded-lg py-2 px-3 transition-all duration-200 border border-orange-600/20
                     hover:border-orange-500/40"
        >
          <BookOpen size={12} />
          Read
        </Link>

        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-xs text-zinc-500
                       hover:text-zinc-300 rounded-lg py-2 px-3 border border-white/[0.06]
                       hover:border-white/15 transition-all duration-200"
          >
            <ExternalLink size={11} />
            Source
          </a>
        )}

        {!item.source_url && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-600">
            <Clock size={11} />
            {item.reading_time_minutes ? `${item.reading_time_minutes} min read` : "Saved"}
          </div>
        )}
      </div>
    </div>
  )
}
