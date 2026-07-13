"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AnimatePresence, motion } from "framer-motion"
import {
    BookOpen,
    Brain,
    CheckCircle2,
    FileText,
    FlaskConical,
    GitFork,
    Globe,
    Loader2,
    PlayCircle,
    Sparkles,
    Tag,
    XCircle
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

const EXAMPLE_TYPES = [
  { label: "LinkedIn URL", icon: Globe, color: "text-blue-400", example: "https://linkedin.com/posts/..." },
  { label: "Medium Article", icon: BookOpen, color: "text-green-400", example: "https://medium.com/..." },
  { label: "Research Paper", icon: FlaskConical, color: "text-purple-400", example: "https://arxiv.org/..." },
  { label: "GitHub Repo", icon: GitFork, color: "text-orange-400", example: "https://github.com/..." },
  { label: "YouTube Video", icon: PlayCircle, color: "text-red-400", example: "https://youtube.com/watch?v=..." },
  { label: "Plain Text / Notes", icon: FileText, color: "text-cyan-400", example: "Paste any notes or text..." },
]

const TYPE_ICON_MAP: Record<string, string> = {
  linkedin: "🔗", blog: "📝", pdf: "📄",
  research: "🔬", github: "💻", youtube: "▶️",
  course: "🎓", plaintext: "📋", note: "📝",
}

const ROUTE_MAP: Record<string, string> = {
  linkedin: "/knowledge/linkedin",
  blog: "/knowledge/blogs",
  research: "/knowledge/papers",
  pdf: "/knowledge/pdfs",
  github: "/knowledge/github",
  youtube: "/knowledge/youtube",
  youtube_video: "/knowledge/youtube",
  youtube_playlist: "/knowledge/youtube",
  course: "/knowledge/courses",
  certification: "/knowledge/certifications",
  note: "/knowledge/notes",
  interview_qna: "/knowledge/interviews",
  plaintext: "/knowledge/notes",
}

function isLinkedInUrl(input: string): boolean {
  return input.trim().includes("linkedin.com/posts/") ||
    input.trim().includes("linkedin.com/pulse/") ||
    input.trim().includes("linkedin.com/feed/update/")
}

interface Step {
  message: string
  status: "done" | "active" | "error"
}

export function UniversalInput() {
  const router = useRouter()
  const [input, setInput] = useState("")
  const [concept, setConcept] = useState("")
  const [loading, setLoading] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const showConceptField = isLinkedInUrl(input)
  const [detectedPreview, setDetectedPreview] = useState<{
    type: string
    domain: string | null
    tree: string | null
  } | null>(null)
  const esRef = useRef<EventSource | null>(null)

  // Live classification preview for plain text
  useEffect(() => {
    const trimmed = input.trim()
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    if (!trimmed || trimmed.length < 20 || trimmed.startsWith("http")) {
      setDetectedPreview(null)
    } else {
      timer = setTimeout(async () => {
        try {
          const res = await fetch("http://localhost:8000/api/ingest/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ raw_input: trimmed }),
          })
          if (!cancelled && res.ok) {
            const data = await res.json()
            setDetectedPreview(data)
          }
        } catch {
          if (!cancelled) setDetectedPreview(null)
        }
      }, 800)
    }

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [input])

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => { esRef.current?.close() }
  }, [])

  const handleSubmit = async () => {
    if (!input.trim()) return
    setLoading(true)
    setSteps([{ message: "Sending to agent pipeline...", status: "active" }])

    try {
      const res = await fetch("http://localhost:8000/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_input: input.trim(), concept: concept.trim() }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      // Open SSE stream for real-time progress
      const es = new EventSource(`http://localhost:8000/api/ingest/${data.job_id}/stream`)
      esRef.current = es

      es.onmessage = (event) => {
        const msg = JSON.parse(event.data)

        if (msg.type === "step") {
          setSteps(prev => [
            ...prev.map(s => ({ ...s, status: "done" as const })),
            { message: msg.step, status: "active" },
          ])
        } else if (msg.type === "done") {
          setSteps(prev => [
            ...prev.map(s => ({ ...s, status: "done" as const })),
            { message: "✅ Saved to your brain!", status: "done" },
          ])
          es.close()
          esRef.current = null
          setLoading(false)
          const detectedType = msg.detected_type ?? "note"
          const typeEmoji = TYPE_ICON_MAP[detectedType] ?? "🧠"
          const route = ROUTE_MAP[detectedType] ?? "/search"
          toast.success("Saved to your brain!", {
            description: `${typeEmoji} ${msg.title || "Content saved successfully"}`,
            action: {
              label: "View",
              onClick: () => router.push(route),
            },
          })
          setTimeout(() => {
            setInput("")
            setConcept("")
            setSteps([])
          }, 2000)
        } else if (msg.type === "error") {
          setSteps(prev => [
            ...prev.map(s => ({ ...s, status: "done" as const })),
            { message: `❌ ${msg.message}`, status: "error" },
          ])
          es.close()
          esRef.current = null
          setLoading(false)
          toast.error("Processing failed", { description: msg.message })
        }
      }

      es.onerror = () => {
        es.close()
        esRef.current = null
        // If SSE fails, fall back to polling
        let attempts = 0
        const poll = setInterval(async () => {
          attempts++
          try {
            const statusRes = await fetch(`http://localhost:8000/api/ingest/${data.job_id}/status`)
            const statusData = await statusRes.json()
            if (statusData.status === "done") {
              clearInterval(poll)
              setLoading(false)
              setSteps([{ message: "✅ Saved to your brain!", status: "done" }])
              toast.success("Saved to your brain!")
              setTimeout(() => { setInput(""); setConcept(""); setSteps([]) }, 2000)
            } else if (statusData.status === "failed" || attempts > 60) {
              clearInterval(poll)
              setLoading(false)
              setSteps([{ message: "❌ Pipeline failed", status: "error" }])
              toast.error("Processing failed")
            }
          } catch { /* keep polling */ }
        }, 3000)
      }

    } catch {
      setLoading(false)
      setSteps([])
      toast.error("Network error", {
        description: "Could not reach the backend. Is the server running on :8000?",
      })
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-3">
      {/* Main input */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600/30 to-cyan-500/30 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
        <div className="relative bg-card border border-border rounded-xl overflow-hidden">
          <Textarea
            id="universal-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste anything — a LinkedIn URL, Medium article, research paper, YouTube link, GitHub repo, notes..."
            className="min-h-[120px] bg-transparent border-0 text-foreground placeholder:text-muted-foreground resize-none rounded-none text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0 p-4"
            disabled={loading}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit()
            }}
          />

          {/* Concept field — slides in when LinkedIn URL detected */}
          <AnimatePresence>
            {showConceptField && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t border-border"
              >
                <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-500/5">
                  <Tag size={13} className="text-violet-400 flex-shrink-0" />
                  <Input
                    id="concept-input"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    placeholder="What concept is this about? (e.g. Guardrails, RAG, Prompt Engineering...)"
                    className="border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 h-7 p-0"
                    disabled={loading}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
            <p className="text-xs text-muted-foreground">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded border border-border">Ctrl</kbd>
              {" "}+{" "}
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded border border-border">Enter</kbd>
              {" "}to submit
            </p>
            <Button
              id="save-to-brain-btn"
              onClick={handleSubmit}
              disabled={loading || !input.trim()}
              size="sm"
              className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white border-0 rounded-lg px-5 font-medium shadow-lg transition-all duration-200 hover:shadow-violet-500/25 hover:scale-105 active:scale-95"
            >
              {loading ? (
                <><Loader2 size={14} className="animate-spin mr-2" />Processing...</>
              ) : (
                <><Sparkles size={14} className="mr-2" />Save to Brain</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Classification preview */}
      <AnimatePresence>
        {detectedPreview && !loading && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/8 border border-cyan-500/15 text-xs text-cyan-300"
          >
            <Brain size={12} />
            <span>
              Detected: <span className="font-medium text-cyan-200">{detectedPreview.type}</span>
              {detectedPreview.domain && (
                <>
                  {" → "}
                  <span className="font-medium text-cyan-200">{detectedPreview.domain}</span>
                </>
              )}
              {detectedPreview.tree && (
                <>
                  {" → "}
                  <span className="font-medium text-cyan-200">{detectedPreview.tree}</span>
                </>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Real-time agent progress steps */}
      <AnimatePresence>
        {steps.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-card border border-border rounded-xl px-4 py-3 space-y-1.5"
          >
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Brain size={10} />
              Agent Pipeline
            </p>
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {step.status === "active" && (
                  <Loader2 size={12} className="text-violet-400 animate-spin mt-0.5 flex-shrink-0" />
                )}
                {step.status === "done" && (
                  <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                )}
                {step.status === "error" && (
                  <XCircle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                )}
                <span className={
                  step.status === "active" ? "text-foreground" :
                  step.status === "error" ? "text-red-400" :
                  "text-muted-foreground"
                }>
                  {step.message}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Example content type chips */}
      <AnimatePresence>
        {!loading && !input && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-3 gap-2"
          >
            {EXAMPLE_TYPES.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.label}
                  onClick={() => setInput(t.example)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border text-left text-xs text-muted-foreground hover:text-foreground hover:border-violet-500/30 hover:bg-violet-500/5 transition-all duration-150"
                >
                  <Icon size={13} className={`${t.color} flex-shrink-0`} />
                  <span className="truncate">{t.label}</span>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
