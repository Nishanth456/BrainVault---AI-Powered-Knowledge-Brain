"use client"
import { KnowledgePageShell } from "@/components/knowledge/KnowledgePageShell"
import { NoteCard, type NoteItem } from "@/components/knowledge/NoteCard"
import { FileText } from "lucide-react"

export default function NotesPage() {
  const fetchItems = async (filters: Record<string, string>, sort: string) => {
    const params = new URLSearchParams(filters)
    params.set("sort", sort)
    const res = await fetch(`http://localhost:8000/api/knowledge/notes?${params.toString()}`)
    if (!res.ok) throw new Error("Failed to fetch")
    const data = await res.json()
    return Array.isArray(data) ? data : (data.items || [])
  }

  return (
    <KnowledgePageShell<NoteItem>
      title="Notes & Text"
      subtitle="Saved notes — automatically tagged and categorised."
      icon={
        <div className="w-8 h-8 rounded-xl bg-yellow-500/15 flex items-center justify-center">
          <FileText size={16} className="text-yellow-400" />
        </div>
      }
      emptyIcon={<FileText size={24} className="text-muted-foreground/50" />}
      emptyTitle="No notes found"
      emptyDescription="You haven't saved any text notes yet."
      emptyHint="Paste some text in the dashboard."
      fetchItems={fetchItems}
      renderCard={(item, onDelete) => <NoteCard key={item.id} item={item} onDelete={onDelete} />}
      getItemId={(item) => item.id}
      filterOptions={{ domains: ["Engineering", "Data Science", "Design", "Management", "General"] }}
    />
  )
}
