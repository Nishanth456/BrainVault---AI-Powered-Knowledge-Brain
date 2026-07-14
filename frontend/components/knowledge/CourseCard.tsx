"use client"
import {
    BookOpen, ExternalLink,
    GraduationCap,
    Loader2,
    Star,
    Trash2,
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
  syllabus?: any[] // array of modules
  prerequisites?: string[]
  key_concepts: string[]
  tags: string[]
  difficulty?: number
  knowledge_tree?: string
  knowledge_domain?: string | null
  reading_time?: number
  created_at?: string
}

export function CourseCard({ item, onDelete }: { item: CourseItem; onDelete?: (id: string) => void }) {
  const diff = item.difficulty || 0
  const [isDeleting, setIsDeleting] = useState(false)
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

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this course?")) return

    setIsDeleting(true)
    try {
      const res = await fetch(`http://localhost:8000/api/knowledge/${item.id}`, {
        method: "DELETE"
      })
      if (res.ok) {
        onDelete?.(item.id)
      } else {
        console.error("Failed to delete course")
        setIsDeleting(false)
      }
    } catch (e) {
      console.error(e)
      setIsDeleting(false)
    }
  }

  return (
    <div
      id={`item-${item.id}`}
      className="group block relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:border-indigo-500/30 hover:bg-white/[0.05] transition-all duration-300 overflow-hidden target-glow-indigo"
    >
      {/* Subtle gradient on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-indigo-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
        {/* Site icon */}
        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
          <GraduationCap size={18} className="text-indigo-400" />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Header row */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500 font-medium flex items-center gap-2">
              {displaySource !== 'Course' && (
                <span className="bg-white/10 text-zinc-300 px-1.5 py-0.5 rounded uppercase tracking-wider text-[10px]">
                  {displaySource}
                </span>
              )}
              Course
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
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

          <a href={item.source_url || "#"} target="_blank" rel="noopener noreferrer" className="block group/link">
            <h3 className="text-lg font-semibold text-zinc-100 group-hover/link:text-indigo-400 transition-colors flex items-center gap-2">
              {item.title}
              <ExternalLink size={14} className="opacity-0 -ml-1 group-hover/link:opacity-100 group-hover/link:ml-0 transition-all text-indigo-400" />
            </h3>
          </a>

          <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all duration-300">
            {item.summary}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500 mt-1">
            {item.instructor && (
              <span className="flex items-center gap-1.5">
                <User size={13} className="text-zinc-400" />
                {item.instructor}
              </span>
            )}
            {item.rating != null && item.rating > 0 && (
              <span className="flex items-center gap-1.5 text-yellow-500">
                <Star size={13} className="fill-current" />
                {item.rating}
              </span>
            )}
            {item.price && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20">
                {item.price}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <BookOpen size={13} className="text-zinc-400" />
              {item.syllabus?.length || 0} Modules
            </span>
          </div>
          
          {/* Course Stats */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs font-medium text-zinc-400 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/10 flex items-center gap-1.5">
              <Layers size={14} className="text-indigo-400" />
              {item.syllabus?.length || 0} sections &bull; {item.syllabus?.reduce((acc, section) => acc + (section.lessons?.length || 0), 0) || 0} lectures
              {item.reading_time ? ` \u2022 ${Math.floor(item.reading_time / 60)}h ${item.reading_time % 60}m total length` : ""}
            </span>
          </div>

          {/* Concepts */}
          {item.key_concepts && item.key_concepts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {item.key_concepts.slice(0, 5).map((concept, i) => (
                <span key={i} className="px-2 py-1 bg-white/5 border border-white/10 rounded-md text-[10px] text-zinc-300 font-medium">
                  {concept}
                </span>
              ))}
              {item.key_concepts.length > 5 && (
                <span className="px-2 py-1 bg-white/5 border border-white/10 rounded-md text-[10px] text-zinc-500 font-medium">
                  +{item.key_concepts.length - 5}
                </span>
              )}
            </div>
          )}

          {/* Expandable Syllabus */}
          {item.syllabus && item.syllabus.length > 0 && (
            <div className="mt-3">
              <button 
                onClick={() => setShowSyllabus(!showSyllabus)}
                className="flex items-center justify-between w-full p-3 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-xl transition-colors text-sm text-zinc-300"
              >
                <span className="font-medium flex items-center gap-2">
                  <BookOpen size={14} className="text-indigo-400" />
                  Course Syllabus
                </span>
                {showSyllabus ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              
              {showSyllabus && (
                <div className="mt-2 space-y-2 p-3 bg-black/20 border border-white/[0.05] rounded-xl max-h-60 overflow-y-auto">
                  {item.syllabus.map((mod: any, idx: number) => (
                    <div key={idx} className="pb-2 border-b border-white/[0.05] last:border-0 last:pb-0">
                      <h4 className="text-sm font-medium text-zinc-200 mb-1">{idx + 1}. {mod.title || "Module"}</h4>
                      {mod.lessons && mod.lessons.length > 0 && (
                        <ul className="pl-5 list-disc space-y-1">
                          {mod.lessons.map((lesson: any, i: number) => (
                            <li key={i} className="text-xs text-zinc-400">{typeof lesson === 'string' ? lesson : lesson.title || 'Lesson'}</li>
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
      </div>
    </div>
  )
}
