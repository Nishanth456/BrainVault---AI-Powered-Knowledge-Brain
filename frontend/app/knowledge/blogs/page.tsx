"use client"
import { KnowledgePageShell } from "@/components/knowledge/KnowledgePageShell"
import { BlogCard, type BlogItem } from "@/components/knowledge/BlogCard"
import { BookOpen } from "lucide-react"

export default function BlogsPage() {
  const fetchItems = async (filters: Record<string, string>, sort: string) => {
    const params = new URLSearchParams(filters)
    params.set("sort", sort)
    const res = await fetch(`http://localhost:8000/api/knowledge/blogs?${params.toString()}`)
    if (!res.ok) throw new Error("Failed to fetch")
    const data = await res.json()
    return Array.isArray(data) ? data : (data.items || [])
  }

  return (
    <KnowledgePageShell<BlogItem>
      title="Blog Articles"
      subtitle="Saved articles — distilled, summarised, and indexed."
      icon={
        <div className="w-8 h-8 rounded-xl bg-orange-500/15 flex items-center justify-center">
          <BookOpen size={16} className="text-orange-400" />
        </div>
      }
      emptyIcon={<BookOpen size={24} className="text-muted-foreground/50" />}
      emptyTitle="No articles found"
      emptyDescription="You haven't saved any blogs yet."
      emptyHint="Paste an article URL in the dashboard."
      fetchItems={fetchItems}
      renderCard={(item, onDelete) => <BlogCard key={item.id} item={item} onDelete={onDelete} />}
      getItemId={(item) => item.id}
      
    />
  )
}
