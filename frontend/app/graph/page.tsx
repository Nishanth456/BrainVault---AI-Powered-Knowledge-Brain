import { EmptyState } from "@/components/ui/EmptyState"
import { Network } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Knowledge Graph — BrainVault" }

export default function GraphPage() {
  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-1">Knowledge Graph</h1>
        <p className="text-muted-foreground text-sm mb-8">
          An interactive visual map of all your knowledge — nodes, connections, and concept clusters.
        </p>
        <EmptyState
          icon={<Network size={28} className="text-pink-400" />}
          title="Knowledge Graph coming in Phase 5"
          description="Once your knowledge base grows, BrainVault will visualise all your concepts as an interactive graph — powered by React Flow."
          hint="Explore relationships between concepts across LinkedIn, papers, courses, and notes."
        />
      </div>
    </div>
  )
}
