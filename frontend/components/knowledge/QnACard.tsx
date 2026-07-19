"use client"
import { ExternalLink, FileText, HelpCircle, Loader2, MessageCircle, Trash2 } from "lucide-react"
import { BookmarkButton } from "@/components/knowledge/BookmarkButton"
import { DeleteWithUndo } from "@/components/knowledge/DeleteWithUndo"
import { restoreItem } from "@/lib/api"
import { ExportButton } from "@/components/knowledge/ExportButton"
import { useState } from "react"

interface Attachment {
  id: string
  filename: string
  minio_path: string
  file_type: string
  page_count?: number | null
}

export interface QnAItem {
  is_bookmarked?: boolean
  id: string
  title: string
  summary: string
  knowledge_tree?: string
  source_url?: string
  attachments?: Attachment[]
}

interface QnACardProps {
  item: QnAItem
  onDelete?: (id: string) => void
}

export function QnACard({ item, onDelete }: QnACardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (confirm("Are you sure you want to delete this Q&A?")) {
      setIsDeleting(true)
      try {
        const res = await fetch(`http://localhost:8000/api/knowledge/${item.id}`, {
          method: "DELETE"
        })
        if (res.ok) {
          setIsDeleted(true)
        } else {
          console.error("Failed to delete item")
          setIsDeleting(false)
        }
      } catch (err) {
        console.error("Error deleting item:", err)
        setIsDeleting(false)
      }
    }
  }

  if (isDeleted) return null

  return (
    <div
      id={`item-${item.id}`}
      className="group relative flex flex-col w-full bg-[#111111]/80 rounded-xl
                 border border-white/[0.05] hover:border-white/[0.1]
                 overflow-hidden transition-all duration-300 shadow-xl target-glow-yellow"
    >
      {/* Top right actions */}
      <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-2">
        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-md bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white 
                       border border-white/5 transition-colors"
            title="View Source"
          >
            <ExternalLink size={14} />
          </a>
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

      {/* Question section */}
      <div className="p-5 bg-violet-900/20 border-b border-violet-500/10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/20 text-violet-400">
            <HelpCircle size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-violet-100 leading-snug whitespace-pre-wrap">
              {item.title}
            </h3>
          </div>
        </div>
      </div>

      {/* Answer section */}
      <div className="p-5 bg-emerald-900/10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
            <MessageCircle size={16} />
          </div>
          <div className="text-sm text-emerald-100/90 leading-relaxed whitespace-pre-wrap">
            {item.summary}
          </div>
        </div>
      </div>

      {/* Attachment section */}
      {item.attachments && item.attachments.length > 0 && (() => {
        const att = item.attachments[0]
        return (
          <div className="px-5 pb-4">
            <a
              href={`http://localhost:8000/api/files/${encodeURIComponent(att.minio_path)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg
                         bg-violet-500/10 border border-violet-500/20
                         text-violet-300 hover:text-violet-100 hover:bg-violet-500/20
                         transition-colors group/att"
              title="View attached document"
            >
              <FileText size={14} className="flex-shrink-0" />
              <span className="text-xs font-medium truncate flex-1">
                {att.filename || "Attached Document"}
              </span>
              {att.page_count && (
                <span className="text-[10px] text-violet-400/70 flex-shrink-0">
                  {att.page_count}p
                </span>
              )}
              <ExternalLink size={11} className="flex-shrink-0 opacity-60 group-hover/att:opacity-100" />
            </a>
          </div>
        )
      })()}

    </div>
  )
}
