"use client"
import {
    BookOpen, ExternalLink,
    GraduationCap,
        Star,
        User,
    ChevronDown,
    ChevronUp,
    Layers
} from "lucide-react"
import { BookmarkButton } from "@/components/knowledge/BookmarkButton"
import { DeleteWithUndo } from "@/components/knowledge/DeleteWithUndo"
import { ExportButton } from "@/components/knowledge/ExportButton"
import { restoreItem } from "@/lib/api"

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

export interface CourseItem {
  is_bookmarked?: boolean
  id: string
  title: string
  summary: string
  source_url?: string
  instructor?: string
  rating?: number
  price?: string
  syllabus?: Record<string, unknown>[] // array of modules
  prerequisites?: string[]
  key_concepts: string[]
  tags: string[]
  difficulty?: number
  knowledge_tree?: string
  knowledge_domain?: string | null
  reading_time?: number
  created_at?: string
  attachments?: import("@/components/knowledge/ExportButton").Attachment[]
}

export function CourseCard({ item, onDelete }: { item: CourseItem; onDelete?: (id: string) => void }) {
  const diff = item.difficulty || 0
  const [showSyllabus, setShowSyllabus] = useState(false)

  let displaySource = 'Course'
  if (item.source_url) {
    try {
      const url = new URL(item.source_url)
      const hostname = url.hostname.replace('www.', '').split('.')[0]
      if (hostname) {
        displaySource = hostname.charAt(0).toUpperCase() + hostname.slice(1)
      }
    } catch (e) {
      // ignore
    }
  }

  const allTags = Array.from(new Set([...(item.key_concepts || []), ...(item.tags || [])]))

  return (
    <div
      id={`item-${item.id}`}
      className="group relative bg-card border border-border rounded-2xl p-5
                  hover:border-indigo-500/30 hover:bg-accent transition-all duration-300
                  flex flex-col gap-3.5 overflow-hidden target-glow-indigo"
    >
      {/* Subtle gradient on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-indigo-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <GraduationCap size={13} className="text-indigo-400" />
          </div>
          {displaySource !== 'Course' && (
            <span className="bg-accent text-muted-foreground px-1.5 py-0.5 rounded uppercase tracking-wider text-[10px]">
              {displaySource}
            </span>
          )}
          <span className="text-xs text-muted-foreground">Course</span>
        </div>

        <div className="flex items-center gap-2">
          {item.knowledge_domain && (
            <span className="text-[11px] font-medium px-2 py-0.5 whitespace-nowrap flex-shrink-0 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
              {item.knowledge_domain}
            </span>
          )}
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
      <a href={item.source_url || "#"} target="_blank" rel="noopener noreferrer" className="block group/link -mb-1">
        <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover/link:text-indigo-400 transition-colors flex items-center gap-2">
          {item.title}
          <ExternalLink size={13} className="opacity-0 -ml-1 group-hover/link:opacity-100 group-hover/link:ml-0 transition-all text-indigo-400 flex-shrink-0" />
        </h3>
      </a>

      {/* Instructor / Rating / Price / Modules */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {item.instructor && (
          <span className="flex items-center gap-1">
            <User size={11} />
            {item.instructor}
          </span>
        )}
        {item.rating != null && item.rating > 0 && (
          <span className="flex items-center gap-1 text-yellow-500">
            <Star size={11} className="fill-current" />
            {item.rating}
          </span>
        )}
        {item.price && (
          <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20">
            {item.price}
          </span>
        )}
        <span className="flex items-center gap-1">
          <BookOpen size={11} />
          {item.syllabus?.length || 0} Modules
        </span>
        {item.reading_time ? (
          <span className="flex items-center gap-1">
            <Layers size={11} className="text-indigo-400" />
            {Math.floor(item.reading_time / 60)}h {item.reading_time % 60}m
          </span>
        ) : null}
      </div>

      {/* Summary */}
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all duration-300">
        {item.summary}
      </p>

      {/* Tags — single scrollable row, same as LinkedIn card */}
      {allTags.length > 0 && (
        <div className="tag-scroll flex gap-1.5 overflow-x-auto pb-1">
          {allTags.map((tag, i) => (
            <span
              key={i}
              className="px-2 py-0.5 text-[11px] bg-indigo-600/10 text-indigo-300
                         whitespace-nowrap flex-shrink-0 rounded-full border border-indigo-600/15"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Expandable Syllabus */}
      {item.syllabus && item.syllabus.length > 0 && (
        <div>
          <button
            onClick={() => setShowSyllabus(!showSyllabus)}
            className="flex items-center justify-between w-full p-3 bg-card/50 hover:bg-accent/50 border border-border/50 rounded-xl transition-colors text-sm text-muted-foreground"
          >
            <span className="font-medium flex items-center gap-2">
              <BookOpen size={14} className="text-indigo-400" />
              Course Syllabus
            </span>
            {showSyllabus ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showSyllabus && (
            <div className="mt-2 space-y-2 p-3 bg-black/20 border border-border/50 rounded-xl max-h-60 overflow-y-auto">
              {item.syllabus.map((mod: Record<string, unknown>, idx: number) => (
                <div key={idx} className="pb-2 border-b border-border/50 last:border-0 last:pb-0">
                  <h4 className="text-sm font-medium text-zinc-200 mb-1">{idx + 1}. {mod.title || "Module"}</h4>
                  {mod.lessons && (mod.lessons as unknown[]).length > 0 && (
                    <ul className="pl-5 list-disc space-y-1">
                      {(mod.lessons as (Record<string, unknown> | string)[]).map((lesson, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground">{typeof lesson === 'string' ? lesson : (lesson as Record<string, unknown>).title as string || 'Lesson'}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
