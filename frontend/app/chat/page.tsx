import { EmptyState } from "@/components/ui/EmptyState"
import { Zap } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "AI Chat — BrainVault" }

export default function ChatPage() {
  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-1">AI Chat</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Chat with your entire knowledge base. Ask anything — BrainVault answers using only what you&apos;ve stored.
        </p>
        <EmptyState
          icon={<Zap size={28} className="text-violet-400" />}
          title="Chat coming in Phase 3"
          description="Once you've saved some knowledge, you'll be able to ask BrainVault questions and get answers grounded in your personal knowledge base."
          hint="Powered by RAG — Retrieval Augmented Generation over your Qdrant vector store."
        />
      </div>
    </div>
  )
}
