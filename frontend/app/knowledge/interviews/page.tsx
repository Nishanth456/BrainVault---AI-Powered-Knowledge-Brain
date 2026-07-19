"use client"
import { KnowledgePageShell } from "@/components/knowledge/KnowledgePageShell"
import { QnACard, type QnAItem } from "@/components/knowledge/QnACard"
import { MessageSquare } from "lucide-react"

export default function InterviewsPage() {
  const fetchItems = async (filters: Record<string, string>, sort: string) => {
    const params = new URLSearchParams(filters)
    params.set("sort", sort)
    const res = await fetch(`http://localhost:8000/api/knowledge/interview?${params.toString()}`)
    if (!res.ok) throw new Error("Failed to fetch")
    const data = await res.json()
    return Array.isArray(data) ? data : (data.items || [])
  }

  return (
    <KnowledgePageShell<QnAItem>
      title="Interview Q&A"
      subtitle="Saved interview questions and discussions."
      icon={
        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
          <MessageSquare size={16} className="text-emerald-400" />
        </div>
      }
      emptyIcon={<MessageSquare size={24} className="text-muted-foreground/50" />}
      emptyTitle="No Q&A found"
      emptyDescription="You haven't saved any interview questions yet."
      emptyHint="Paste Q&A text in the dashboard."
      fetchItems={fetchItems}
      renderCard={(item, onDelete) => <QnACard key={item.id} item={item} onDelete={onDelete} />}
      getItemId={(item) => item.id}
      
    />
  )
}
