"use client"
import { Clock, X } from "lucide-react"

export function RecentSearches({ searches, onSelect, onClear }: { searches: string[]; onSelect: (s: string) => void; onClear: () => void }) {
  if (searches.length === 0) return null

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Recent Searches</h3>
        <button onClick={onClear} className="text-xs text-zinc-500 hover:text-zinc-300">Clear</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {searches.map(s => (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.05] hover:border-indigo-500/30 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
          >
            <Clock size={12} className="text-zinc-500" />
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
