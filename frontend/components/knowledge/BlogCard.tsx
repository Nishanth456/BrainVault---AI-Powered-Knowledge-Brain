"use client"
import {
  Clock,
  ExternalLink,
  Globe,
  User,
} from "lucide-react"
import { BookmarkButton } from "@/components/knowledge/BookmarkButton"
import { DeleteWithUndo } from "@/components/knowledge/DeleteWithUndo"
import { ExportButton } from "@/components/knowledge/ExportButton"
import { restoreItem } from "@/lib/api"

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
  is_bookmarked?: boolean
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
  attachments?: import("@/components/knowledge/ExportButton").Attachment[]
}

export function BlogCard({ item, onDelete }: { item: BlogItem; onDelete?: (id: string) => void }) {
  const diff = item.difficulty || 0

  return (
    <div
      id={`item-${item.id}`}
      className="group relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5
                 hover:border-orange-500/30 hover:bg-white/[0.05] transition-all duration-300
                 flex flex-col gap-3.5 overflow-hidden"
    >
      {/* Subtle gradient on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300
                      bg-gradient-to-br from-orange-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
            <Globe size={13} className="text-orange-400" />
          </div>
          <span className="text-xs text-zinc-500 font-medium truncate">{item.site || "Blog"}</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {diff > 0 && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${difficultyColor[diff]}`}>
              {difficultyLabel[diff]}
            </span>
          )}

          <div className="flex items-center gap-2">
            <BookmarkButton itemId={item.id} initial={item.is_bookmarked || false} />
            <ExportButton attachments={item.attachments} />
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
      {item.summary && (
        <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all duration-300">
          {item.summary}
        </p>
      )}

      {/* Tags */}
      {item.tags?.length > 0 && (
        <div className="tag-scroll flex gap-1.5 overflow-x-auto pb-1">
          {item.tags.map(tag => (
            <span
              key={tag}
              className="px-2 py-0.5 text-[11px] bg-orange-600/10 text-orange-300
                         whitespace-nowrap flex-shrink-0 rounded-full border border-orange-600/15"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/[0.05]">
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
            Article
          </a>
        )}
        {!!item.reading_time_minutes && (
          <div className={`flex items-center gap-1.5 text-xs text-zinc-600 ${item.source_url ? "ml-auto" : ""}`}>
            <Clock size={11} />
            {item.reading_time_minutes} min read
          </div>
        )}
      </div>
    </div>
  )
}
