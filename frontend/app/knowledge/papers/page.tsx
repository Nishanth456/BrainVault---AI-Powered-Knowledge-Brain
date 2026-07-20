"use client"
import { KnowledgePageShell } from "@/components/knowledge/KnowledgePageShell"
import { PaperCard, type PaperItem } from "@/components/knowledge/PaperCard"
import { GraduationCap } from "lucide-react"

export default function PapersPage() {
  const fetchItems = async (filters: Record<string, string>, sort: string) => {
    const params = new URLSearchParams(filters)
    params.set("sort", sort)
    const res = await fetch(`http://127.0.0.1:8000/api/knowledge/papers?${params.toString()}`)
    if (!res.ok) throw new Error("Failed to fetch")
    const data = await res.json()
    return Array.isArray(data) ? data : (data.items || [])
  }

  return (
    <KnowledgePageShell<PaperItem>
      title="Research Papers"
      subtitle="Saved papers and PDFs — with key concepts and citations extracted."
      icon={
        <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center">
          <GraduationCap size={16} className="text-violet-400" />
        </div>
      }
      emptyIcon={<GraduationCap size={24} className="text-muted-foreground/50" />}
      emptyTitle="No papers found"
      emptyDescription="You haven't saved any research papers yet."
      emptyHint="Paste an Arxiv or PDF URL in the dashboard."
      fetchItems={fetchItems}
      renderCard={(item, onDelete) => <PaperCard key={item.id} item={item} onDelete={onDelete} />}
      getItemId={(item) => item.id}
      
      singleColumn={true}
    />
  )
}
