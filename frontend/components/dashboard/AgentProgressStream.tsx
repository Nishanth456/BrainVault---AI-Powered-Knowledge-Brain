"use client"
import { useEffect, useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, CheckCircle2, AlertCircle, Zap } from "lucide-react"

interface AgentStep {
  message: string
  timestamp: number
  status: "active" | "done" | "error"
}

interface AgentProgressStreamProps {
  jobId: string | null
  isActive: boolean
  onComplete?: (data: { knowledgeTree?: string; knowledgeItemId?: string; title?: string }) => void
}

export function AgentProgressStream({ jobId, isActive, onComplete }: AgentProgressStreamProps) {
  const [steps, setSteps] = useState<AgentStep[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isActive || !jobId) {
      setSteps([])
      return
    }

    setSteps([
      { message: "🔗 Connecting to agent pipeline...", status: "active", timestamp: Date.now() }
    ])

    const eventSource = new EventSource(`http://127.0.0.1:8000/api/ingest/${jobId}/stream`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === "step") {
          setSteps(prev => [
            // Mark all previous steps as done
            ...prev.map(s => s.status === "active" ? { ...s, status: "done" as const } : s),
            { message: data.step, status: "active", timestamp: Date.now() }
          ])
        } else if (data.type === "done") {
          setSteps(prev => [
            ...prev.map(s => ({ ...s, status: "done" as const })),
            { message: "✅ Saved to your brain!", status: "done", timestamp: Date.now() }
          ])
          eventSource.close()
          onComplete?.({
            knowledgeTree:    data.knowledge_tree,
            knowledgeItemId:  data.knowledge_item_id,
            title:            data.title,
          })
        } else if (data.type === "error") {
          setSteps(prev => [
            ...prev.map(s => s.status === "active" ? { ...s, status: "done" as const } : s),
            { message: `❌ ${data.message}`, status: "error", timestamp: Date.now() }
          ])
          eventSource.close()
        }
      } catch {
        // Ignore parse errors
      }
    }

    eventSource.onerror = () => {
      setSteps(prev => {
        // Only add an error if we haven't finished yet
        const hasFinished = prev.some(s => s.message.includes("Saved to your brain"))
        if (hasFinished) return prev
        return [
          ...prev.map(s => s.status === "active" ? { ...s, status: "done" as const } : s),
          { message: "⚠️ Connection lost — check Celery worker is running", status: "error", timestamp: Date.now() }
        ]
      })
      eventSource.close()
    }

    return () => eventSource.close()
  }, [jobId, isActive])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [steps])

  if (!isActive && steps.length === 0) return null

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        ref={scrollRef}
        className="bg-card border border-border rounded-xl p-4 max-h-48 overflow-y-auto space-y-2"
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Zap size={12} className="text-violet-400" />
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Agent Pipeline
          </span>
          {isActive && steps.some(s => s.status === "active") && (
            <span className="ml-auto flex items-center gap-1 text-xs text-violet-400">
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-violet-400"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              Live
            </span>
          )}
        </div>

        <AnimatePresence>
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-2 text-sm"
            >
              {step.status === "active" ? (
                <Loader2 size={14} className="text-violet-400 mt-0.5 flex-shrink-0 animate-spin" />
              ) : step.status === "error" ? (
                <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
              ) : (
                <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
              )}
              <span className={
                step.status === "active"
                  ? "text-white"
                  : step.status === "error"
                    ? "text-red-400"
                    : "text-zinc-400"
              }>
                {step.message}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
