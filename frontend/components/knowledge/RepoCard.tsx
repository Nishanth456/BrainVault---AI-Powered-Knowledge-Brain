"use client"
import {
    Code2,
    ExternalLink,
    Loader2,
    Star,
    Trash2,
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

export interface RepoItem {
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
  repo_stars?: number | null
  repo_language?: string | null
  tech_stack?: string[]
  architecture_summary?: string | null
}

export function RepoCard({ item, onDelete }: { item: RepoItem; onDelete?: (id: string) => void }) {
  const diff = item.difficulty || 0
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm("Are you sure you want to delete this repository?")) return

    setIsDeleting(true)
    try {
      const res = await fetch(`http://localhost:8000/api/knowledge/${item.id}`, {
        method: "DELETE"
      })
      if (res.ok) {
        onDelete?.(item.id)
      } else {
        console.error("Failed to delete repository")
        setIsDeleting(false)
      }
    } catch (err) {
      console.error(err)
      setIsDeleting(false)
    }
  }

  const stack = item.tech_stack || []

  return (
    <a
      id={`item-${item.id}`}
      href={item.source_url || "#"}
      target={item.source_url ? "_blank" : undefined}
      rel={item.source_url ? "noopener noreferrer" : undefined}
      className="group block relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:border-emerald-500/30 hover:bg-white/[0.05] transition-all duration-300 overflow-hidden target-glow-emerald"
    >
      {/* Subtle gradient on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-emerald-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
        {/* Repo icon */}
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
          <Code2 size={18} className="text-emerald-400" />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Header row: language + stars + difficulty + delete */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
              {item.repo_language && <span>{item.repo_language}</span>}
              {typeof item.repo_stars === "number" && (
                <span className="flex items-center gap-1 text-yellow-400/80">
                  <Star size={11} className="fill-yellow-400/80" />
                  {item.repo_stars.toLocaleString()}
                </span>
              )}
            </div>
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
                title="Delete this repository"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-base font-semibold text-white leading-snug line-clamp-2">
            {item.title || "Untitled Repository"}
          </h3>

          {/* Summary */}
          <p className="text-sm text-zinc-400 leading-relaxed line-clamp-3">
            {item.summary || "No summary available."}
          </p>

          {/* Architecture summary */}
          {item.architecture_summary && (
            <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2 border-l-2 border-emerald-500/30 pl-3">
              {item.architecture_summary}
            </p>
          )}

          {/* Tech stack chips */}
          {stack.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {stack.slice(0, 8).map((tech) => (
                <span
                  key={tech}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.06] text-zinc-400 border border-white/[0.06]"
                >
                  {tech}
                </span>
              ))}
            </div>
          )}

          {/* Footer: concepts + open link */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {item.key_concepts?.slice(0, 4).map((concept) => (
                <span
                  key={concept}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300/80 border border-emerald-500/15"
                >
                  {concept}
                </span>
              ))}
            </div>
            {item.source_url && (
              <ExternalLink size={13} className="text-zinc-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
            )}
          </div>
        </div>
      </div>
    </a>
  )
}
