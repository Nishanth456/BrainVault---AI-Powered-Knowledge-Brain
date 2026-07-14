"use client"
import { Badge } from "@/components/ui/badge"
import { Bookmark, Calendar, Hash, SlidersHorizontal, Star, X } from "lucide-react"

interface FilterBarProps {
  filters: Record<string, string>
  onChange: (filters: Record<string, string>) => void
  domains?: string[]
}

const DIFFICULTIES = [1, 2, 3, 4, 5]
const DATES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 3 months" },
]

export function FilterBar({ filters, onChange, domains }: FilterBarProps) {
  const toggle = (key: string, value: string) => {
    const next = { ...filters }
    if (next[key] === value) delete next[key]
    else next[key] = value
    onChange(next)
  }

  const clear = () => onChange({})
  const hasFilters = Object.keys(filters).length > 0

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <div className="flex items-center gap-1.5 text-xs text-zinc-500 mr-2">
        <SlidersHorizontal size={12} />
        Filters
      </div>

      <button
        onClick={() => toggle("bookmarked", "true")}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
          filters.bookmarked === "true"
            ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
            : "bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-white"
        }`}
      >
        <Bookmark size={11} />
        Saved
      </button>

      {domains?.map(domain => (
        <button
          key={domain}
          onClick={() => toggle("domain", domain)}
          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
            filters.domain === domain
              ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300"
              : "bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-white"
          }`}
        >
          {domain}
        </button>
      ))}

      {DIFFICULTIES.map(d => (
        <button
          key={d}
          onClick={() => toggle("difficulty", String(d))}
          className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
            filters.difficulty === String(d)
              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
              : "bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-white"
          }`}
        >
          L{d}
        </button>
      ))}

      {DATES.map(d => (
        <button
          key={d.value}
          onClick={() => toggle("days", d.value)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
            filters.days === d.value
              ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
              : "bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-white"
          }`}
        >
          <Calendar size={11} />
          {d.label}
        </button>
      ))}

      {hasFilters && (
        <button
          onClick={clear}
          className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X size={11} />
          Clear
        </button>
      )}
    </div>
  )
}
