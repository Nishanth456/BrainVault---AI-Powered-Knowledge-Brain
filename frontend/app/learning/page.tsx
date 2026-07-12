import { EmptyState } from "@/components/ui/EmptyState"
import { Map } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Learning Paths — BrainVault" }

export default function LearningPage() {
  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-1">Learning Paths</h1>
        <p className="text-muted-foreground text-sm mb-8">
          AI-generated progressive study plans built from your saved knowledge — beginner to advanced.
        </p>
        <EmptyState
          icon={<Map size={28} className="text-emerald-400" />}
          title="Learning paths coming in Phase 4"
          description="Once you've built up your knowledge base, BrainVault will generate personalised learning paths across any topic — ordered from foundational to advanced."
          hint="Example: 'Teach me LLMs' → generates a path using only what you've saved."
        />
      </div>
    </div>
  )
}
