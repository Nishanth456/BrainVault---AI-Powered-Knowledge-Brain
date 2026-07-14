"use client"
import { Download } from "lucide-react"
import { useState } from "react"
import { exportItem } from "@/lib/api"
import { toast } from "sonner"

export function ExportButton({ itemId, title }: { itemId: string; title?: string }) {
  const [loading, setLoading] = useState(false)

  const handleExport = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoading(true)
    try {
      const content = await exportItem(itemId, "markdown")
      const blob = new Blob([content], { type: "text/markdown" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${title || "export"}.md`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Exported successfully")
    } catch (err) {
      toast.error("Failed to export")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="p-1.5 rounded-md border border-white/10 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
      title="Export as Markdown"
    >
      <Download size={14} />
    </button>
  )
}
