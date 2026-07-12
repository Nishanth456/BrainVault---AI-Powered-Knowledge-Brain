import { EmptyState } from "@/components/ui/EmptyState"
import { FlaskConical } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Research Papers — BrainVault" }

export default function PapersPage() {
  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-1">Research Papers</h1>
        <p className="text-muted-foreground text-sm mb-8">
          ArXiv papers, academic PDFs, and research articles — structured with method, results, and key findings.
        </p>
        <EmptyState
          icon={<FlaskConical size={28} className="text-purple-400" />}
          title="No research papers saved yet"
          description="Paste an ArXiv link or any research paper PDF URL in the dashboard to get started."
          hint="Papers are analysed with Gemini's 1M token context window for full document understanding."
        />
      </div>
    </div>
  )
}
