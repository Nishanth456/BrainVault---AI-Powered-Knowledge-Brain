"use client"
import { Trash2, Loader2 } from "lucide-react"
import { useState } from "react"
import { softDeleteItem } from "@/lib/api"
import { toast } from "sonner"

interface DeleteWithUndoProps {
  itemId: string
  itemTitle?: string
  onDelete: (id: string) => void
  onUndo?: (id: string) => void | Promise<void>
}

export function DeleteWithUndo({ itemId, itemTitle, onDelete, onUndo }: DeleteWithUndoProps) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoading(true)
    try {
      await softDeleteItem(itemId)
      onDelete(itemId)
      toast("Moved to trash", {
        description: itemTitle || "Item moved to trash",
        action: {
          label: "Undo",
          onClick: async () => {
            if (onUndo) {
              await onUndo(itemId)
              window.dispatchEvent(new Event("knowledge-item-restored"))
            }
          },
        },
        duration: 5000,
      })
    } catch (err) {
      console.error(err)
      toast.error("Failed to delete item")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50"
      title="Delete"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
  )
}
