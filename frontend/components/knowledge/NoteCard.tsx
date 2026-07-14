"use client"
import { ChevronRight, Clock, Loader2, Tag, Trash2 } from "lucide-react"
import { BookmarkButton } from "@/components/knowledge/BookmarkButton"
import { DeleteWithUndo } from "@/components/knowledge/DeleteWithUndo"
import { restoreItem } from "@/lib/api"
import { ExportButton } from "@/components/knowledge/ExportButton"
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

export interface NoteItem {
  is_bookmarked?: boolean
  id: string
  title: string
  summary: string
  knowledge_tree?: string
  knowledge_domain?: string | null
  key_concepts: string[]
  tags: string[]
  difficulty?: number
  reading_time: number
  created_at?: string
}

interface NoteCardProps {
  item: NoteItem
  onDelete?: (id: string) => void
}

export function NoteCard({ item, onDelete }: NoteCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const diff = item.difficulty || 0

  const handleDelete = async () => {
    if (!window.confirm("Delete this note?")) return
    setIsDeleting(true)
    try {
      const res = await fetch(`http://localhost:8000/api/knowledge/${item.id}`, { method: "DELETE" })
      if (res.ok) onDelete?.(item.id)
      else setIsDeleting(false)
    } catch (e) {
      console.error(e)
      setIsDeleting(false)
    }
  }

  return (
    <div
      id={`item-${item.id}`}
      className="group relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5
                 hover:border-cyan-500/30 hover:bg-white/[0.05] transition-all duration-300
                 flex flex-col gap-3.5 overflow-hidden target-glow-cyan"
    >

      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300
                      bg-gradient-to-br from-cyan-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/15 flex items-center justify-center flex-shrink-0">
            <Tag size={13} className="text-cyan-400" />
          </div>
          <span className="text-xs text-zinc-500 font-medium">{item.knowledge_domain || "Note"}</span>
        </div>

        <div className="flex items-center gap-2">
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
      <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2 -mb-1">
        {item.title || "Untitled Note"}
      </h3>

      {/* Summary */}
      <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
        {item.summary}
      </p>

      {/* Tags */}
      {item.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.slice(0, 5).map(tag => (
            <span
              key={tag}
              className="px-2 py-0.5 text-[11px] bg-cyan-600/10 text-cyan-300
                         rounded-full border border-cyan-600/15"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Tree path */}
      {item.knowledge_tree && (
        <div className="flex items-center gap-1 text-[11px] text-zinc-600 truncate">
          <ChevronRight size={10} className="flex-shrink-0" />
          <span className="truncate">{item.knowledge_tree}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-1.5 text-xs text-zinc-600 mt-auto pt-2 border-t border-white/[0.05]">
        <Clock size={11} />
        {item.reading_time ? `${item.reading_time} min read` : "Saved"}
      </div>
    </div>
  )
}
