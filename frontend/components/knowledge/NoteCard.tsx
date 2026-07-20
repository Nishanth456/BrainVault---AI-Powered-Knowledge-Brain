"use client"
import { Clock, Edit2, Tag, Check, X } from "lucide-react"
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
  raw_content?: string
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
  const diff = item.difficulty || 0
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(item.raw_content || "")
  const [displayValue, setDisplayValue] = useState(item.raw_content || "")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch(`http://127.0.0.1:8000/api/knowledge/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_content: editValue }),
      })
      setDisplayValue(editValue)
      setEditing(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditValue(item.raw_content || "")
    setEditing(false)
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

      {/* Raw content — what the user pasted, with inline edit */}
      <div className="relative">
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full text-xs text-zinc-300 bg-white/[0.04] border border-white/[0.12] rounded-lg p-3 leading-relaxed resize-none focus:outline-none focus:border-cyan-500/50 min-h-[100px] font-mono"
              rows={6}
              autoFocus
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-zinc-400 hover:text-white border border-white/[0.08] rounded-lg transition-colors"
              >
                <X size={11} /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <Check size={11} /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="group/raw relative">
            <pre className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono bg-white/[0.02] rounded-lg p-3 border border-white/[0.05]">
              {displayValue || item.summary}
            </pre>
            <button
              onClick={() => setEditing(true)}
              className="absolute top-2 right-2 opacity-0 group-hover/raw:opacity-100 transition-opacity p-1 rounded-md bg-white/5 border border-white/10 text-zinc-500 hover:text-zinc-300"
              title="Edit content"
            >
              <Edit2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* AI Insight */}
      {item.summary && item.summary !== item.raw_content && (
        <div className="flex gap-2 pt-1 border-t border-white/[0.05]">
          <span className="text-[10px] font-semibold text-cyan-400/70 uppercase tracking-wider mt-0.5 flex-shrink-0">AI</span>
          <p className="text-xs text-zinc-500 leading-relaxed italic">
            {item.summary}
          </p>
        </div>
      )}

      {/* Tags */}
      {item.tags?.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-0.5">
          {item.tags?.map(tag => (
            <span
              key={tag}
              className="px-2 py-0.5 text-[11px] bg-cyan-600/10 text-cyan-300
                         whitespace-nowrap flex-shrink-0 rounded-full border border-cyan-600/15"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      {!!item.reading_time && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-600 mt-auto pt-2 border-t border-white/[0.05]">
          <Clock size={11} />
          {item.reading_time} min read
        </div>
      )}
    </div>
  )
}
