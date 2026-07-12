import { EmptyState } from "@/components/ui/EmptyState"
import { Code2 } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "GitHub Repos — BrainVault" }

export default function GithubPage() {
  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-1">GitHub Repos</h1>
        <p className="text-muted-foreground text-sm mb-8">
          GitHub repositories with README analysis, tech stack detection, architecture overview, and use cases.
        </p>
        <EmptyState
          icon={<Code2 size={28} className="text-orange-400" />}
          title="No GitHub repos saved yet"
          description="Paste a GitHub repository URL in the dashboard to get started."
          hint="The GitHub Agent extracts README, tech stack, language stats, and architectural insights."
        />
      </div>
    </div>
  )
}
