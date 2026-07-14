"use client"
import {
    BookOpen,
    ChevronRight,
    Clock,
    ExternalLink,
    FileText,
    Loader2,
    Trash2,
    User
} from "lucide-react"
import Link from "next/link"
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

interface Attachment {
  id: string
  filename: string
  minio_path: string
  file_type: string
  page_count?: number | null
}

export interface LinkedInItem {
  is_bookmarked?: boolean
  id: string
  title: string
  summary: string
  source_url?: string
  author?: string
  key_concepts: string[]
  tags: string[]
  difficulty?: number
  reading_time: number
  knowledge_tree?: string
  knowledge_domain?: string | null
  created_at?: string
  attachments: Attachment[]
}

// Inline LinkedIn logo SVG (lucide-react doesn't include it in all versions)
const LinkedInLogo = ({ size = 13, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
)

export function LinkedInCard({ item, onDelete }: { item: LinkedInItem; onDelete?: (id: string) => void }) {
  const hasPdf = item.attachments?.some(a => a.file_type === "pdf")
  const pdfAtt = item.attachments?.find(a => a.file_type === "pdf")
  const diff = item.difficulty || 0
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this item?")) return
    
    setIsDeleting(true)
    try {
      const res = await fetch(`http://localhost:8000/api/knowledge/${item.id}`, {
        method: "DELETE"
      })
      if (res.ok) {
        onDelete?.(item.id)
      } else {
        console.error("Failed to delete item")
        setIsDeleting(false)
      }
    } catch (e) {
      console.error(e)
      setIsDeleting(false)
    }
  }

  return (
    <div className="group relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5
                    hover:border-violet-500/30 hover:bg-white/[0.05] transition-all duration-300
                    flex flex-col gap-3.5 overflow-hidden">

      {/* Subtle gradient on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300
                      bg-gradient-to-br from-violet-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0077B5]/15 flex items-center justify-center flex-shrink-0">
            <LinkedInLogo size={13} className="text-[#0077B5]" />
          </div>
          <span className="text-xs text-zinc-500 font-medium">LinkedIn</span>
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
        {item.title || "Untitled Post"}
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
        className="text-xs text-zinc-400 leading-relaxed line-clamp-1"
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
              className="px-2 py-0.5 text-[11px] bg-violet-600/10 text-violet-300
                         rounded-full border border-violet-600/15"
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

      {/* PDF attachment badge */}
      {hasPdf && (
        <div className="flex items-center gap-1.5 text-xs text-cyan-400
                        bg-cyan-500/8 rounded-lg px-3 py-2 border border-cyan-500/15">
          <FileText size={12} className="flex-shrink-0" />
          <span className="truncate">
            📎 {pdfAtt?.page_count ? `${pdfAtt.page_count} pages` : "PDF attached"}
          </span>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/[0.05]">
        {hasPdf && (
          <Link
            href={`/knowledge/linkedin/${item.id}/reader`}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium
                       bg-violet-600/20 hover:bg-violet-600/35 text-violet-300 hover:text-violet-200
                       rounded-lg py-2 px-3 transition-all duration-200 border border-violet-600/20
                       hover:border-violet-500/40"
          >
            <BookOpen size={12} />
            Read PDF
          </Link>
        )}
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
            Post
          </a>
        )}
        {!hasPdf && !item.source_url && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-600">
            <Clock size={11} />
            {item.reading_time ? `${item.reading_time} min read` : "Saved"}
          </div>
        )}
      </div>
    </div>
  )
}
