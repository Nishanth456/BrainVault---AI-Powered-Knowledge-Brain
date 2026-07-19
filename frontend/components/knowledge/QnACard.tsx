"use client"
import { ExternalLink, FileText, HelpCircle, MessageCircle, Tag } from "lucide-react"
import { BookmarkButton } from "@/components/knowledge/BookmarkButton"
import { DeleteWithUndo } from "@/components/knowledge/DeleteWithUndo"
import { restoreItem } from "@/lib/api"
import { ExportButton } from "@/components/knowledge/ExportButton"

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

export interface QnAItem {
  is_bookmarked?: boolean
  id: string
  title: string
  summary: string
  knowledge_tree?: string
  knowledge_domain?: string | null
  tags?: string[]
  difficulty?: number | null
  source_url?: string
  attachments?: Attachment[]
}

interface QnACardProps {
  item: QnAItem
  onDelete: (id: string) => void
}

export function QnACard({ item, onDelete }: QnACardProps) {

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
                onDelete={onDelete}
                onUndo={async (id) => {
                  await restoreItem(id)
                }}
              />
            </div>
      </div>

      {/* Question section */}
      <div className="p-5 bg-violet-900/20 border-b border-violet-500/10">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-violet-500/20 text-violet-400 flex-shrink-0 mt-0.5">
            <HelpCircle size={16} />
          </div>
          <div className="flex-1 min-w-0">
            {/* Domain + Difficulty badges */}
            {(item.knowledge_domain || (item.difficulty && item.difficulty > 0)) && (
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                {item.knowledge_domain && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-300 whitespace-nowrap">
                    {item.knowledge_domain}
                  </span>
                )}
                {item.difficulty && item.difficulty > 0 && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${difficultyColor[item.difficulty]}`}>
                    {difficultyLabel[item.difficulty]}
                  </span>
                )}
              </div>
            )}
            <h3 className="text-sm font-semibold text-violet-100 leading-snug whitespace-pre-wrap">
              {item.title}
            </h3>
          </div>
        </div>
      </div>

      {/* Answer section */}
      <div className="p-5 bg-emerald-900/10">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 flex-shrink-0 mt-0.5">
            <MessageCircle size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-emerald-100/90 leading-relaxed whitespace-pre-wrap">
              {item.summary}
            </div>
            {/* Tags */}
            {item.tags && item.tags.length > 0 && (
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                <Tag size={10} className="text-zinc-500 flex-shrink-0" />
                {item.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-[10px] bg-emerald-600/10 text-emerald-400/80
                               whitespace-nowrap flex-shrink-0 rounded-full border border-emerald-600/15"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
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
