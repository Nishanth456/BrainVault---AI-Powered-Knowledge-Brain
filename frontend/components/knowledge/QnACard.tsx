"use client"
import { useState } from "react"
import { Trash2, Loader2, ExternalLink, MessageCircle, HelpCircle } from "lucide-react"

export interface QnAItem {
  id: string
  title: string
  summary: string
  knowledge_tree: string
  source_url: string
}

interface QnACardProps {
  item: QnAItem
}

export function QnACard({ item }: QnACardProps) {
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
      className="group relative flex flex-col w-full bg-[#111111]/80 rounded-xl
                 border border-white/[0.05] hover:border-white/[0.1]
                 overflow-hidden transition-all duration-300 shadow-xl"
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
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 
                     border border-red-500/20 transition-colors disabled:opacity-50"
          title="Delete Q&A"
        >
          {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
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

    </div>
  )
}
