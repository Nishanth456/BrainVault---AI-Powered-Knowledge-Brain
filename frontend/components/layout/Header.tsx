"use client"
import { Brain, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

export function Header() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchValue, setSearchValue] = useState("")

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
    const q = searchValue.trim()
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`)
      setSearchValue("")
    }
  }

  return (
    <header className="h-14 border-b border-white/[0.08] bg-black/60 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 flex items-center justify-between flex-shrink-0">
      {/* Logo / title */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center">
          <Brain size={14} className="text-white" />
        </div>
        <span className="text-sm font-bold text-white hidden sm:inline">BrainVault</span>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSubmit} className="hidden sm:flex items-center flex-1 max-w-md mx-6">
        <div className="relative w-full">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            placeholder="Search your brain... (/)"
            className="w-full h-8 pl-9 pr-4 rounded-full bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] transition-colors"
          />
        </div>
      </form>

      {/* Right side placeholder */}
      <div className="w-8" />
    </header>
  )
}
