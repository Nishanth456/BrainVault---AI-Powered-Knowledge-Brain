import { EmptyState } from "@/components/ui/EmptyState"
import { Search } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Semantic Search — BrainVault" }

export default function SearchPage() {
  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-1">Semantic Search</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Search your entire knowledge base using natural language — not keywords.
        </p>
        <EmptyState
          icon={<Search size={28} className="text-cyan-400" />}
          title="Search coming in Phase 2"
          description="Once you've saved some knowledge, you'll be able to search semantically across all content types using natural language queries."
          hint="Powered by Qdrant vector search + nomic-embed-text embeddings (local, private, free)."
        />
      </div>
    </div>
  )
}
