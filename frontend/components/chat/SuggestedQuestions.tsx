"use client"

import { Card } from "@/components/ui/card"
import { Sparkles } from "lucide-react"

const SUGGESTIONS = [
  "Summarize my latest saved paper",
  "What do I know about FastAPI?",
  "Compare my notes on RAG vs my blog posts",
  "What are the key concepts across my LinkedIn posts?",
]

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void
}

export function SuggestedQuestions({ onSelect }: SuggestedQuestionsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {SUGGESTIONS.map((question) => (
        <Card
          key={question}
          className="flex cursor-pointer items-center gap-3 p-4 transition-colors hover:bg-muted/50"
          onClick={() => onSelect(question)}
        >
          <Sparkles className="h-4 w-4 shrink-0 text-violet-400" />
          <p className="text-sm text-muted-foreground">{question}</p>
        </Card>
      ))}
    </div>
  )
}
