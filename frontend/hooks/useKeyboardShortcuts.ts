"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

const SEQUENCE_TIMEOUT = 800

export function useKeyboardShortcuts(searchInputRef?: React.RefObject<HTMLInputElement | null>) {
  const router = useRouter()

  useEffect(() => {
    let sequence = ""
    let timeout: ReturnType<typeof setTimeout>

    const routes: Record<string, string> = {
      n: "/knowledge/notes",
      y: "/knowledge/youtube",
      g: "/knowledge/github",
      b: "/knowledge/blogs",
      p: "/knowledge/papers",
      i: "/knowledge/interviews",
      c: "/chat",
      s: "/search",
      d: "/",
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable

      if (e.key === "/" && !typing) {
        e.preventDefault()
        searchInputRef?.current?.focus()
        return
      }

      if (typing) return

      if (e.key === "g") {
        sequence = "g"
        clearTimeout(timeout)
        timeout = setTimeout(() => (sequence = ""), SEQUENCE_TIMEOUT)
        return
      }

      if (sequence === "g" && routes[e.key]) {
        e.preventDefault()
        router.push(routes[e.key])
        sequence = ""
        return
      }

      sequence = ""
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [router, searchInputRef])
}
