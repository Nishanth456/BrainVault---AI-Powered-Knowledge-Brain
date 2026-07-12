"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Brain,
    ChevronRight,
    Clock,
    Hash,
    Loader2,
    Sparkles,
    Tag,
    Trash2,
    Zap,
} from "lucide-react"
import { useState } from "react"

const difficultyLabel = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert"]
const difficultyColor = [
  "",
  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "bg-red-500/10 text-red-400 border-red-500/20",
]

export interface NoteItem {
  id: string
  title: string
  summary: string
  knowledge_domain?: string | null
  knowledge_tree?: string | null
  knowledge_subdomain?: string | null
  knowledge_topic?: string | null
  key_concepts: string[]
  tags: string[]
  difficulty: number
  reading_time_minutes: number
  importance_score: number
  created_at: string
  raw_content?: string
}

interface NoteListItemProps {
  item: NoteItem
  onDelete?: (id: string) => void
}

export function NoteListItem({ item, onDelete }: NoteListItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const diff = item.difficulty || 0

  const handleDelete = async () => {
    if (!window.confirm("Delete this note?")) return
    setIsDeleting(true)
    try {
      const res = await fetch(`http://localhost:8000/api/knowledge/${item.id}`, {
        method: "DELETE",
      })
      if (res.ok) onDelete?.(item.id)
      else setIsDeleting(false)
    } catch (e) {
      console.error(e)
      setIsDeleting(false)
    }
  }

  const created = new Date(item.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  return (
    <div className="group relative">
      {/* Active left accent */}
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-cyan-500/0 via-cyan-500/40 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />

      <div
        className="pl-5 pr-4 py-5 border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Top row: title + meta */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <h3 className="text-[15px] font-semibold text-white leading-snug">
                {item.title || "Untitled Note"}
              </h3>
              {diff > 0 && (
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 h-5 ${difficultyColor[diff]}`}
                >
                  {difficultyLabel[diff]}
                </Badge>
              )}
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed max-w-3xl whitespace-pre-wrap">
              {item.raw_content || item.summary || "No content available"}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
              onClick={(e) => {
                e.stopPropagation()
                handleDelete()
              }}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </Button>
            <ChevronRight
              size={16}
              className={`text-zinc-600 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </div>
        </div>

        {/* Middle row: taxonomy + stats */}
        <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-zinc-500">
          {item.knowledge_domain && (
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-cyan-400" />
              <span className="text-zinc-300">{item.knowledge_domain}</span>
              {item.knowledge_tree && (
                <>
                  <ChevronRight size={10} className="text-zinc-600" />
                  <span>{item.knowledge_tree}</span>
                </>
              )}
              {item.knowledge_subdomain && (
                <>
                  <ChevronRight size={10} className="text-zinc-600" />
                  <span>{item.knowledge_subdomain}</span>
                </>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <Clock size={12} />
            <span>{item.reading_time_minutes || 1} min read</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Zap size={12} className="text-amber-400" />
            <span>Importance {item.importance_score || 0}/10</span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
            <Tag size={12} />
            <span>{created}</span>
          </div>
        </div>

        {/* Tags row */}
        {item.tags?.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <Hash size={11} className="text-zinc-600 mr-0.5" />
            {item.tags.slice(0, 6).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[10px] px-2 py-0 h-5 bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] border-none"
              >
                {tag}
              </Badge>
            ))}
            {item.tags.length > 6 && (
              <span className="text-[10px] text-zinc-600">+{item.tags.length - 6}</span>
            )}
          </div>
        )}

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-white/[0.05] animate-in fade-in slide-in-from-top-2 duration-200">
            {item.key_concepts?.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-2">
                  <Brain size={12} className="text-purple-400" />
                  Key concepts
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {item.key_concepts.map((concept) => (
                    <Badge
                      key={concept}
                      variant="outline"
                      className="text-[11px] px-2 py-0 h-6 border-purple-500/20 text-purple-300 bg-purple-500/10"
                    >
                      {concept}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {item.summary && item.summary !== item.raw_content && (
              <div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-2">
                  <Sparkles size={12} className="text-cyan-400" />
                  AI summary
                </div>
                <div className="bg-zinc-950/50 border border-white/[0.06] rounded-lg p-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {item.summary
                    .split(/\n\n+/)
                    .map((para) => para.replace(/\n(?!\s*[-•])/g, " ").trim())
                    .join("\n\n")}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
