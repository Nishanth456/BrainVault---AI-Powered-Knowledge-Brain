"use client"
import { Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

interface SearchBarProps {
  placeholder?: string
  className?: string
  compact?: boolean
}

export function SearchBar({
  placeholder = "Search your brain... (/)",
  className = "",
  compact = false,
}: SearchBarProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState("")

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = value.trim()
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`)
      setValue("")
    }
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="relative w-full">
        <Search
          size={compact ? 13 : 14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-full bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-colors ${
            compact ? "h-8 pl-8 pr-7 text-xs" : "h-9 pl-9 pr-8 text-sm"
          }`}
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
          >
            <X size={compact ? 12 : 13} />
          </button>
        )}
      </div>
    </form>
  )
}
