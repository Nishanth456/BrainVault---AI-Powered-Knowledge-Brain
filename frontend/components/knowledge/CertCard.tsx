"use client"
import {
    Award, ExternalLink,
    Calendar,
    ShieldCheck,
            AlertCircle
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

export interface CertItem {
  is_bookmarked?: boolean
  id: string
  title: string
  summary: string
  source_url?: string
  issuer?: string
  issue_date?: string
  valid_until?: string
  cert_id?: string
  exam_topics?: string[]
  key_concepts: string[]
  tags: string[]
  difficulty?: number
  knowledge_tree?: string
  knowledge_domain?: string | null
  created_at?: string
  attachments?: import("@/components/knowledge/ExportButton").Attachment[]
}

export function CertCard({ item, onDelete }: { item: CertItem; onDelete?: (id: string) => void }) {
  const diff = item.difficulty || 0
  
  let displaySource = 'Certification'
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

  // Check if expired
  const isExpired = item.valid_until && new Date(item.valid_until) < new Date() && item.valid_until !== "Unknown"

  return (
    <div
      id={`item-${item.id}`}
      className="group block relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:border-yellow-500/30 hover:bg-white/[0.05] transition-all duration-300 overflow-hidden target-glow-yellow"
    >
      {/* Subtle gradient on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-yellow-600/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
        {/* Site icon */}
        <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center flex-shrink-0">
          <Award size={18} className="text-yellow-400" />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Header row */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500 font-medium flex items-center gap-2">
              {displaySource !== 'Certification' && (
                <span className="bg-white/10 text-zinc-300 px-1.5 py-0.5 rounded uppercase tracking-wider text-[10px]">
                  {displaySource}
                </span>
              )}
              Certification
            </span>
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

          <a href={item.source_url || "#"} target="_blank" rel="noopener noreferrer" className="block group/link">
            <h3 className="text-lg font-semibold text-zinc-100 group-hover/link:text-yellow-400 transition-colors flex items-center gap-2">
              {item.title}
              <ExternalLink size={14} className="opacity-0 -ml-1 group-hover/link:opacity-100 group-hover/link:ml-0 transition-all text-yellow-400" />
            </h3>
          </a>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500 mt-1">
            {item.issuer && (
              <span className="flex items-center gap-1.5 font-medium text-zinc-300">
                <ShieldCheck size={14} className="text-yellow-500" />
                {item.issuer}
              </span>
            )}
            {item.issue_date && item.issue_date !== "Unknown" && (
              <span className="flex items-center gap-1.5">
                <Calendar size={13} className="text-zinc-400" />
                Issued: {item.issue_date}
              </span>
            )}
            {item.valid_until && item.valid_until !== "Unknown" && (
              <span className={`flex items-center gap-1.5 ${isExpired ? 'text-red-400' : 'text-emerald-400'}`}>
                {isExpired ? <AlertCircle size={13} /> : <Calendar size={13} />}
                {isExpired ? 'Expired: ' : 'Valid until: '} {item.valid_until}
              </span>
            )}
          </div>
          
          <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all duration-300 mt-1">
            {item.summary}
          </p>

          {/* Exam Topics */}
          {item.exam_topics && item.exam_topics.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-zinc-300 mb-2 uppercase tracking-wider">Exam Topics</h4>
              <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-0.5">
                {item.exam_topics.map((topic, i) => (
                  <span key={i} className="px-2 py-1 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-md text-[10px] font-medium">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags / Key Concepts */}
          {item.key_concepts && item.key_concepts.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pt-2 mt-auto">
              {item.key_concepts.slice(0, 6).map((concept, i) => (
                <span key={i} className="px-2 py-0.5 text-[11px] bg-yellow-500/10 text-yellow-300/80 whitespace-nowrap flex-shrink-0 rounded-full border border-yellow-500/15">
                  {concept}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
