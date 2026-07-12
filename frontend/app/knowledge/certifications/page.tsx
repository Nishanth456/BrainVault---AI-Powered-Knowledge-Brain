import { EmptyState } from "@/components/ui/EmptyState"
import { Award } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Certifications — BrainVault" }

export default function CertificationsPage() {
  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-1">Certifications</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Credentials earned, exam prep notes, and certification resources — tracked with expiry countdowns.
        </p>
        <EmptyState
          icon={<Award size={28} className="text-amber-400" />}
          title="No certifications saved yet"
          description="Paste a certification credential link or exam preparation material in the dashboard to get started."
          hint="BrainVault tracks expiry dates, finds knowledge gaps, and links cert topics to your existing knowledge."
        />
      </div>
    </div>
  )
}
