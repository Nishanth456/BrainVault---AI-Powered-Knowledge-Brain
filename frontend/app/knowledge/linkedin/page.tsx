"use client"
import { KnowledgePageShell } from "@/components/knowledge/KnowledgePageShell"
import { LinkedInCard, type LinkedInItem } from "@/components/knowledge/LinkedInCard"
import { Link2 } from "lucide-react"

export default function LinkedinPage() {
  const fetchItems = async (filters: Record<string, string>, sort: string) => {
    const params = new URLSearchParams(filters)
    params.set("sort", sort)
    const res = await fetch(`http://localhost:8000/api/knowledge/linkedin?${params.toString()}`)
    if (!res.ok) throw new Error("Failed to fetch")
    const data = await res.json()
    return Array.isArray(data) ? data : (data.items || [])
  }

  return (
    <KnowledgePageShell<LinkedInItem>
      title="LinkedIn Network"
      subtitle="Saved posts, articles, and profiles — analysed for insights and embedded for semantic retrieval."
      icon={
        <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center">
          <Link2 size={16} className="text-blue-400" />
        </div>
      }
      emptyIcon={<Link2 size={24} className="text-muted-foreground/50" />}
      emptyTitle="No posts found"
      emptyDescription="You haven't saved any LinkedIn content yet."
      emptyHint="Paste a LinkedIn URL in the dashboard to add one."
      fetchItems={fetchItems}
      renderCard={(item, onDelete) => <LinkedInCard key={item.id} item={item} onDelete={onDelete} />}
      getItemId={(item) => item.id}
      filterOptions={{ domains: ["Engineering", "Data Science", "Design", "Management", "General"] }}
    />
  )
}
