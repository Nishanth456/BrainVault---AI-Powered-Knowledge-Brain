"use client"
import { useEffect, useState } from "react"
import { getTrashItems, restoreItem, type SearchResultItem } from "@/lib/api"
import { SearchResultCard } from "@/components/search/SearchResultCard"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"

export default function TrashPage() {
  const [items, setItems] = useState<SearchResultItem[]>([])

  useEffect(() => {
    getTrashItems().then(setItems).catch(console.error)
  }, [])

  const restore = async (id: string) => {
    try {
      await restoreItem(id)
      setItems(prev => prev.filter(i => i.id !== id))
      toast.success("Item restored")
    } catch (_) {
      toast.error("Failed to restore item")
    }
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center">
            <Trash2 size={16} className="text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Trash</h1>
        </div>
        <p className="text-zinc-500 text-sm mb-6">Items stay here until you restore or permanently delete them.</p>

        {items.length === 0 && <p className="text-zinc-600 text-sm">Trash is empty.</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => (
            <div key={item.id} className="relative group">
              <SearchResultCard item={item} />
              <Button
                size="sm"
                onClick={() => restore(item.id)}
                className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10"
              >
                Restore
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
