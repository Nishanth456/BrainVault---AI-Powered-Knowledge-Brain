"use client"
import { KnowledgePageShell } from "@/components/knowledge/KnowledgePageShell"
import { RepoCard, type RepoItem } from "@/components/knowledge/RepoCard"
import { GitBranch } from "lucide-react"

export default function GithubPage() {
  const fetchItems = async (filters: Record<string, string>, sort: string) => {
    const params = new URLSearchParams(filters)
    params.set("sort", sort)
    const res = await fetch(`http://127.0.0.1:8000/api/knowledge/github?${params.toString()}`)
    if (!res.ok) throw new Error("Failed to fetch")
    const data = await res.json()
    return Array.isArray(data) ? data : (data.items || [])
  }

  return (
    <KnowledgePageShell<RepoItem>
      title="GitHub Repositories"
      subtitle="Saved repos — with architecture summaries, tech stack extraction, and semantic search."
      icon={
        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
          <GitBranch size={16} className="text-zinc-300" />
        </div>
      }
      emptyIcon={<GitBranch size={24} className="text-muted-foreground/50" />}
      emptyTitle="No repositories found"
      emptyDescription="You haven't saved any GitHub repositories yet."
      emptyHint="Paste a GitHub repo URL in the dashboard to add one."
      fetchItems={fetchItems}
      renderCard={(item, onDelete) => <RepoCard key={item.id} item={item} onDelete={onDelete} />}
      getItemId={(item) => item.id}
      
      singleColumn={true}
    />
  )
}
