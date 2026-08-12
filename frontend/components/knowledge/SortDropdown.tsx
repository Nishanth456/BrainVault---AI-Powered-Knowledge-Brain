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
      <ArrowDownWideNarrow size={14} className="text-muted-foreground" />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-card border border-border text-muted-foreground text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500/40"
      >
        {OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
