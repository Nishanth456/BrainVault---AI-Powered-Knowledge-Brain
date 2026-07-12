import { EmptyState } from "@/components/ui/EmptyState"
import { BookOpen } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Blog Library — BrainVault" }

export default function BlogsPage() {
  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-1">Blog Library</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Articles from Medium, Dev.to, Hashnode, Substack, and personal blogs — summarised and indexed.
        </p>
        <EmptyState
          icon={<BookOpen size={28} className="text-green-400" />}
          title="No blog articles saved yet"
          description="Paste a Medium, Dev.to, Hashnode, or any blog URL in the dashboard to get started."
          hint="The Blog Agent extracts key concepts, author info, and reading time automatically."
        />
      </div>
    </div>
  )
}
