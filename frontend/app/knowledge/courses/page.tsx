import { EmptyState } from "@/components/ui/EmptyState"
import { GraduationCap } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Courses — BrainVault" }

export default function CoursesPage() {
  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-1">Courses</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Udemy, Coursera, fast.ai, and DeepLearning.AI courses — syllabus extracted and progress tracked.
        </p>
        <EmptyState
          icon={<GraduationCap size={28} className="text-indigo-400" />}
          title="No courses saved yet"
          description="Paste a Udemy, Coursera, fast.ai, or DeepLearning.AI course URL in the dashboard to get started."
          hint="The Course Agent extracts the full syllabus, instructor info, and maps it to your knowledge tree."
        />
      </div>
    </div>
  )
}
