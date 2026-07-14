"use client"
import Link from "next/link"
import { ExternalLink } from "lucide-react"

interface RecentItem {
  id: string
  type: string
  title: string | null
  created_at: string
}

export function RecentActivityList({ items, className = "" }: { items: RecentItem[], className?: string }) {
  if (items.length === 0) return null
  
  return (
    <div className={`bg-zinc-900 border border-white/10 rounded-2xl p-6 ${className}`}>
      <h3 className="text-zinc-100 font-semibold mb-4">Recent Activity</h3>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
            <div>
              <div className="text-sm font-medium text-white mb-0.5">{item.title || "Untitled Document"}</div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="uppercase tracking-wide">{item.type}</span>
                <span>•</span>
                <span>{item.created_at ? new Date(item.created_at).toLocaleDateString() : "Just now"}</span>
              </div>
            </div>
            <Link href={`/knowledge/${item.type.split('_')[0]}?id=${item.id}`} className="text-zinc-500 group-hover:text-violet-400 transition-colors">
              <ExternalLink size={16} />
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
