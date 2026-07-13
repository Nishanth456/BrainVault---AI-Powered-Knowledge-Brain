"use client"
import { SourceCitationCard } from "@/components/chat/SourceCitationCard"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { sendChatMessage, type SearchResultItem } from "@/lib/api"
import {
    ArrowLeft,
    Bookmark,
    BookOpen,
    ExternalLink,
    FileText,
    Loader2,
    MessageSquare,
    Send,
    ZoomIn, ZoomOut
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"

// Use the CDN worker so we don't need to copy files manually
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const difficultyLabel = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert"]
const difficultyColor = [
  "",
  "text-emerald-400", "text-blue-400", "text-yellow-400",
  "text-orange-400",  "text-red-400",
]

interface LinkedInReaderProps {
  item: {
    id: string
    title: string
    summary: string
    source_url: string
    knowledge_tree: string
    tags: string[]
    difficulty: number
    author?: string
  }
  pdfMinioPaths: string[]  // e.g. ["brainvault-files/linkedin_abc.pdf"]
}

export function LinkedInReader({ item, pdfMinioPaths }: LinkedInReaderProps) {
  const [numPages, setNumPages]       = useState<number>(0)
  const [pageNumber, setPageNumber]   = useState<number>(1)
  const [pageInput, setPageInput]     = useState<string>("1")
  const [scale, setScale]             = useState<number>(1.0)
  const [aiPanelOpen, setAiPanelOpen] = useState<boolean>(false)
  const [containerHeight, setContainerHeight] = useState<number>(600)
  const [aiMessages, setAiMessages]   = useState<{ role: "user" | "assistant"; content: string; citations?: SearchResultItem[] }[]>([])
  const [aiInput, setAiInput]         = useState<string>("")
  const [aiStreaming, setAiStreaming] = useState<boolean>(false)

  // Support multiple PDFs — show first by default
  const [currentPdfIndex] = useState(0)
  const currentPdfPath = pdfMinioPaths[currentPdfIndex]

  // Backend proxies the PDF — MinIO URL is never exposed to the frontend
  const pdfApiUrl = currentPdfPath
    ? `http://localhost:8000/api/files/${currentPdfPath}`
    : null

  // Measure container height for horizontal PDF scale
  useEffect(() => {
    const handleResize = () => {
      const pdfPanel = document.getElementById("pdf-canvas-container")
      if (pdfPanel) {
        setContainerHeight(Math.max(pdfPanel.clientHeight - 64, 400)) // 64px for padding
      }
    }
    handleResize()
    setTimeout(handleResize, 100)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
  }, [])

  function handleAiSend() {
    if (!aiInput.trim() || aiStreaming) return
    const question = aiInput.trim()
    setAiMessages((prev) => [...prev, { role: "user", content: question }])
    setAiInput("")
    setAiStreaming(true)

    let answer = ""
    let citations: SearchResultItem[] = []

    sendChatMessage(
      question,
      {
        onToken: (token: string) => {
          answer += token
          setAiMessages((prev) => {
            const withoutStreaming = prev.filter((m) => m.role !== "assistant" || m.content !== answer.slice(0, -token.length))
            return [...withoutStreaming, { role: "assistant", content: answer, citations: [] }]
          })
        },
        onCitations: (cits: SearchResultItem[]) => {
          citations = cits
        },
        onDone: () => {
          setAiStreaming(false)
          setAiMessages((prev) => {
            const withoutStreaming = prev.filter((m) => !(m.role === "assistant" && m.content === answer && m.citations?.length === 0))
            return [...withoutStreaming, { role: "assistant", content: answer, citations }]
          })
        },
        onError: () => {
          setAiStreaming(false)
          setAiMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Sorry, I couldn't answer that. Please try again." },
          ])
        },
      },
      undefined,
      { types: ["linkedin"] }
    )
  }

  if (!pdfApiUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0A0A0F] text-zinc-400 gap-4">
        <FileText size={40} className="text-zinc-700" />
        <p className="text-sm">No PDF attachment found for this item.</p>
        <Link href="/knowledge/linkedin">
          <Button variant="outline" size="sm" className="border-white/10 text-zinc-400 hover:text-white">
            <ArrowLeft size={14} className="mr-2" />
            Back to LinkedIn
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#0A0A0F] text-white overflow-hidden">

      {/* ── Left: PDF Viewer ──────────────────────────────────────── */}
      <div id="pdf-panel" className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top navigation bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]
                        bg-[#0D0D14] flex-shrink-0 flex-wrap gap-y-2">

          {/* Back button */}
          <Link href="/knowledge/linkedin">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white p-2 h-8 w-8">
              <ArrowLeft size={15} />
            </Button>
          </Link>

          {/* Title + tree */}
          <div className="flex-1 min-w-0 hidden sm:block">
            <p className="text-sm font-medium text-white truncate leading-tight">{item.title}</p>
            {item.knowledge_tree && (
              <p className="text-[11px] text-zinc-600 truncate">{item.knowledge_tree}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-3">
             <span className="text-xs font-medium text-zinc-400">{numPages} Pages</span>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 border-l border-white/[0.06] pl-2">
            <Button
              variant="ghost" size="sm"
              onClick={() => setScale(s => Math.max(0.5, +(s - 0.15).toFixed(2)))}
              className="text-zinc-400 hover:text-white p-1.5 h-8 w-8"
            >
              <ZoomOut size={13} />
            </Button>
            <span className="text-xs text-zinc-500 w-9 text-center select-none">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="ghost" size="sm"
              onClick={() => setScale(s => Math.min(3.0, +(s + 0.15).toFixed(2)))}
              className="text-zinc-400 hover:text-white p-1.5 h-8 w-8"
            >
              <ZoomIn size={13} />
            </Button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 border-l border-white/[0.06] pl-2">
            <Button
              variant="outline" size="sm"
              onClick={() => setAiPanelOpen(v => !v)}
              className={`h-8 text-xs border-white/10 gap-1.5 transition-colors ${
                aiPanelOpen
                  ? "bg-violet-600/20 text-violet-300 border-violet-500/30"
                  : "text-zinc-400 hover:text-white bg-transparent"
              }`}
            >
              <MessageSquare size={12} />
              Ask AI
            </Button>
            <Button
              variant="ghost" size="sm"
              className="text-zinc-400 hover:text-white p-1.5 h-8 w-8"
              title="Bookmark"
            >
              <Bookmark size={14} />
            </Button>
            {item.source_url && (
              <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                <Button
                  variant="ghost" size="sm"
                  className="text-zinc-400 hover:text-white p-1.5 h-8 w-8"
                  title="Open original post"
                >
                  <ExternalLink size={13} />
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* PDF canvas */}
        <div id="pdf-canvas-container" className="flex-1 overflow-x-auto overflow-y-hidden bg-[#111118]">
          <Document
            file={pdfApiUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={err => console.error("PDF load error:", err)}
            loading={
              <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
                <FileText size={28} className="animate-pulse text-zinc-600" />
                <span className="text-sm">Loading PDF...</span>
              </div>
            }
            error={
              <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400/70 text-center">
                <FileText size={28} />
                <p className="text-sm">Failed to load PDF.</p>
                <p className="text-xs text-zinc-600">
                  Make sure the backend is running and the file exists in MinIO.
                </p>
              </div>
            }
            className="flex h-full min-w-max items-center px-8 gap-6"
          >
            {Array.from(new Array(numPages), (el, index) => (
              <Page
                key={`page_${index + 1}`}
                pageNumber={index + 1}
                height={containerHeight * scale}
                renderTextLayer={true}         
                renderAnnotationLayer={true}   
                className="shadow-2xl shadow-black/60 rounded-sm bg-white overflow-hidden flex-shrink-0"
              />
            ))}
          </Document>
        </div>
      </div>

      {/* ── Right: AI Panel (Phase 6) ───────────────────────────── */}
      {aiPanelOpen && (
        <div className="w-80 border-l border-white/[0.06] flex flex-col bg-[#0D0D14] flex-shrink-0">

          {/* Panel header */}
          <div className="p-4 border-b border-white/[0.05] flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-violet-600/20 flex items-center justify-center">
              <MessageSquare size={12} className="text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Ask AI</h3>
              <p className="text-[11px] text-zinc-500">About this document</p>
            </div>
          </div>

          {/* Document context */}
          <div className="mx-4 my-3 p-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-1.5">
              <BookOpen size={11} className="text-violet-400" />
              <span className="text-[11px] text-zinc-500 font-medium">Document context</span>
            </div>
            <p
              className="text-xs text-zinc-400 line-clamp-1 leading-relaxed"
              title={item.summary}
            >
              {item.summary}
            </p>
            {item.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {item.tags.slice(0, 3).map(t => (
                  <span key={t} className="text-[10px] text-violet-400/70 bg-violet-600/8
                                           px-1.5 py-0.5 rounded-full border border-violet-600/15">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Chat messages */}
          <ScrollArea className="flex-1 px-4">
            <div className="space-y-4 py-2">
              {aiMessages.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-4">
                  Ask a question about this document.
                </p>
              )}
              {aiMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`text-xs leading-relaxed rounded-lg px-3 py-2 ${
                    msg.role === "user"
                      ? "bg-violet-600/20 text-violet-100 ml-4"
                      : "bg-white/[0.03] text-zinc-300 mr-4"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {msg.citations.map((c) => (
                        <SourceCitationCard key={c.id} citation={c} compact />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-3 border-t border-white/[0.06]">
            <div className="flex items-end gap-2">
              <Textarea
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleAiSend()
                  }
                }}
                placeholder="Ask anything..."
                className="min-h-[60px] flex-1 resize-none border-white/[0.08] bg-white/[0.03] text-xs text-zinc-300 placeholder:text-zinc-600 focus-visible:ring-violet-500/30"
                rows={2}
              />
              <Button
                size="icon"
                className="h-8 w-8 shrink-0 bg-violet-600 hover:bg-violet-500"
                disabled={!aiInput.trim() || aiStreaming}
                onClick={handleAiSend}
              >
                {aiStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
