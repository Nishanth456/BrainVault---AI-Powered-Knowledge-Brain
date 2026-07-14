"use client"
import { ArrowDownWideNarrow, CalendarArrowDown, CalendarArrowUp, Flame, GraduationCap } from "lucide-react"

const OPTIONS = [
  { value: "newest", label: "Newest first", icon: CalendarArrowDown },
  { value: "oldest", label: "Oldest first", icon: CalendarArrowUp },
  { value: "difficulty", label: "Difficulty", icon: GraduationCap },
  { value: "importance", label: "Importance", icon: Flame },
]

export function SortDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <ArrowDownWideNarrow size={14} className="text-zinc-500" />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-white/[0.03] border border-white/[0.08] text-zinc-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500/40"
      >
        {OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
