"use client"
import { Button } from "@/components/ui/button"
import type { SearchFilters as SearchFiltersType } from "@/lib/api"

const CONTENT_TYPES = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "blog", label: "Blogs" },
  { value: "research", label: "Research Papers" },
  { value: "note", label: "Notes" },
  { value: "interview_qna", label: "Interview Q&A" },
]

interface SearchFiltersProps {
  filters: SearchFiltersType
  onChange: (filters: SearchFiltersType) => void
  onClear: () => void
}

export function SearchFilters({ filters, onChange, onClear }: SearchFiltersProps) {
  const toggleType = (type: string) => {
    const current = filters.types || []
    const next = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type]
    onChange({ ...filters, types: next.length ? next : undefined })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Content Type</h3>
        <div className="flex flex-wrap gap-2">
          {CONTENT_TYPES.map(t => {
            const active = filters.types?.includes(t.value)
            return (
              <button
                key={t.value}
                onClick={() => toggleType(t.value)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  active
                    ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                    : "bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Max Difficulty</h3>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={5}
            value={filters.difficulty_max || 5}
            onChange={e => onChange({ ...filters, difficulty_max: parseInt(e.target.value) })}
            className="flex-1 accent-indigo-500"
          />
          <span className="text-xs text-zinc-400 w-6">{filters.difficulty_max || 5}</span>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onClear}
        className="border-white/10 text-zinc-400 hover:text-white w-full"
      >
        Clear Filters
      </Button>
    </div>
  )
}
