import { EmptyState } from "@/components/ui/EmptyState"
import { BookOpen } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "PDF Library — BrainVault" }

export default function PdfsPage() {
  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-1">PDF Library</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Books, cheat sheets, slides, and documentation — with in-app PDF reader and AI summary.
        </p>
        <EmptyState
          icon={<BookOpen size={28} className="text-rose-400" />}
          title="No PDFs saved yet"
          description="Paste a PDF URL or file path in the dashboard to get started. PDFs are stored in MinIO and readable directly in the app."
          hint="Each PDF gets page-by-page extraction, section summaries, and a difficulty score."
        />
      </div>
    </div>
  )
}
