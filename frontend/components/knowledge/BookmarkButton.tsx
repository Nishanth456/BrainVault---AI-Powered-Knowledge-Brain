"use client"
import { Bookmark } from "lucide-react"
import { useState } from "react"
import { toggleBookmark } from "@/lib/api"

export function BookmarkButton({ itemId, initial }: { itemId: string; initial: boolean }) {
  const [bookmarked, setBookmarked] = useState(initial)
  const [loading, setLoading] = useState(false)

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (loading) return
    setLoading(true)
    try {
      const res = await toggleBookmark(itemId)
      setBookmarked(res.is_bookmarked)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`p-1.5 rounded-md border transition-colors ${
        bookmarked
          ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
          : "bg-white/5 border-white/10 text-zinc-500 hover:text-zinc-300"
      }`}
      title={bookmarked ? "Remove bookmark" : "Bookmark this item"}
    >
      <Bookmark size={14} fill={bookmarked ? "currentColor" : "none"} />
    </button>
  )
}
