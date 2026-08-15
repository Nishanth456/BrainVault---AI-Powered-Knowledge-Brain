"use client"
import { SourceCitationCard } from "@/components/chat/SourceCitationCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { sendChatMessage, type SearchResultItem } from "@/lib/api"
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquare,
  Send,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer"
import { StreamingMessage } from "@/components/chat/StreamingMessage"
import Link from "next/link"
import { BookmarkButton } from "@/components/knowledge/BookmarkButton"
import { useCallback, useEffect, useState, useRef } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"

// Guard against SSR — pdfjs accesses browser globals at module evaluation time
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
}

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
    raw_content?: string
    structured?: Record<string, string>
    is_bookmarked?: boolean
  }
  pdfMinioPaths: string[] // e.g. ["brainvault-files/linkedin_abc.pdf"]
  backHref?: string       // where the ← back button navigates (default: /knowledge/linkedin)
}

export function LinkedInReader({ item, pdfMinioPaths, backHref = "/knowledge/linkedin" }: LinkedInReaderProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [pageInput, setPageInput] = useState<string>("1")
  const [scale, setScale] = useState<number>(1.0)
  const [aiPanelOpen, setAiPanelOpen] = useState<boolean>(false)
  const [containerHeight, setContainerHeight] = useState<number>(600)
  const [aiMessages, setAiMessages] = useState<
    { id?: string; role: "user" | "assistant"; content: string; citations?: SearchResultItem[] }[]
  >([])
  const [aiInput, setAiInput] = useState<string>("")
  const [aiStreaming, setAiStreaming] = useState<boolean>(false)
  const [aiSessionId, setAiSessionId] = useState<string | undefined>(undefined)

  const containerRef = useRef<HTMLDivElement>(null)

  // Support multiple PDFs — show first by default
  const [currentPdfIndex] = useState(0)
  const currentPdfPath = pdfMinioPaths[currentPdfIndex]

  // Backend proxies the PDF — MinIO URL is never exposed to the frontend
  const pdfApiUrl = currentPdfPath
    ? `http://127.0.0.1:8000/api/files/${currentPdfPath}`
    : null

  // Measure container height for horizontal PDF scale
  useEffect(() => {
    if (typeof window !== "undefined") {
      pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
    }
    const handleResize = () => {
      const pdfPanel = document.getElementById("pdf-canvas-container")
      if (pdfPanel) {
        // Reserve space for top bar, padding and page indicator pill
        setContainerHeight(Math.max(pdfPanel.clientHeight - 90, 360))
      }
    }
    handleResize()
    const timer = setTimeout(handleResize, 150)
    window.addEventListener("resize", handleResize)
    return () => {
      window.removeEventListener("resize", handleResize)
      clearTimeout(timer)
    }
  }, [])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
  }, [])

  // Smooth scroll to a specific page
  const scrollToPage = useCallback(
    (page: number, smooth: boolean = true) => {
      const clamped = Math.max(1, Math.min(numPages || 1, page))
      setPageNumber(clamped)
      setPageInput(String(clamped))

      const targetEl = document.getElementById(`pdf-page-${clamped}`)
      if (targetEl) {
        targetEl.scrollIntoView({
          behavior: smooth ? "smooth" : "auto",
          inline: "center",
          block: "nearest",
        })
      }
    },
    [numPages]
  )

  // Mouse wheel horizontal scroll listener (converts vertical wheel to horizontal carousel scroll)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      // If user is scrolling with mouse wheel (dominant deltaY)
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        container.scrollLeft += e.deltaY * 1.2
      }
    }

    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => {
      container.removeEventListener("wheel", handleWheel)
    }
  }, [])

  // Active page detection as user scrolls horizontally
  useEffect(() => {
    const container = containerRef.current
    if (!container || numPages === 0) return

    let animationFrameId: number

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect()
      const containerCenter = containerRect.left + containerRect.width / 2

      let closestPage = 1
      let minDistance = Infinity

      for (let i = 1; i <= numPages; i++) {
        const el = document.getElementById(`pdf-page-${i}`)
        if (el) {
          const rect = el.getBoundingClientRect()
          const pageCenter = rect.left + rect.width / 2
          const distance = Math.abs(pageCenter - containerCenter)
          if (distance < minDistance) {
            minDistance = distance
            closestPage = i
          }
        }
      }

      setPageNumber(closestPage)
      setPageInput(String(closestPage))
    }

    const onScroll = () => {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = requestAnimationFrame(handleScroll)
    }

    container.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      container.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(animationFrameId)
    }
  }, [numPages])

  // Keyboard navigation (Left / Right arrow keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault()
        scrollToPage(pageNumber - 1)
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        scrollToPage(pageNumber + 1)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [pageNumber, numPages, scrollToPage])

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
            const withoutStreaming = prev.filter((m) => m.id !== "streaming")
            return [
              ...withoutStreaming,
              { id: "streaming", role: "assistant", content: answer, citations: [] },
            ]
          })
        },
        onCitations: (cits: SearchResultItem[]) => {
          citations = cits
        },
        onDone: (sid?: string) => {
          setAiStreaming(false)
          if (sid) setAiSessionId(sid)
          setAiMessages((prev) => {
            const withoutStreaming = prev.filter((m) => m.id !== "streaming")
            return [...withoutStreaming, { role: "assistant", content: answer, citations }]
          })
        },
        onError: () => {
          setAiStreaming(false)
          setAiMessages((prev) => [
            ...prev.filter((m) => m.id !== "streaming"),
            { role: "assistant", content: "Sorry, I couldn't answer that. Please try again." },
          ])
        },
      },
      aiSessionId,
      { item_id: item.id }
    )
  }

  if (!pdfApiUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0A0A0F] text-muted-foreground gap-4">
        <FileText size={40} className="text-zinc-700" />
        <p className="text-sm">No PDF attachment found for this item.</p>
        <Link href={backHref}>
          <Button
            variant="outline"
            size="sm"
            className="border-border text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} className="mr-2" />
            Back
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#09090D] text-foreground overflow-hidden relative select-none">
      {/* ── Left: PDF Viewer ──────────────────────────────────────── */}
      <div id="pdf-panel" className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        {/* Top navigation bar */}
        <div
          className="flex items-center gap-2 px-4 py-2.5 border-b border-border/60
                        bg-[#0D0D14]/90 backdrop-blur-md flex-shrink-0 w-full overflow-x-auto no-scrollbar relative z-30"
        >
          {/* Back button */}
          <Link href={backHref}>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground p-2 h-8 w-8 rounded-lg"
            >
              <ArrowLeft size={15} />
            </Button>
          </Link>

          {/* Title + tree */}
          <div className="flex-1 min-w-0 hidden sm:block">
            <p className="text-sm font-medium text-foreground truncate leading-tight">
              {item.title}
            </p>
            {item.knowledge_tree && (
              <p className="text-[11px] text-muted-foreground truncate">{item.knowledge_tree}</p>
            )}
          </div>

          {/* Page navigation */}
          <div className="flex items-center gap-1.5 px-3 bg-card/60 border border-border/50 rounded-lg py-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => scrollToPage(pageNumber - 1)}
              disabled={pageNumber <= 1}
              className="text-muted-foreground hover:text-foreground p-1 h-7 w-7 disabled:opacity-30 rounded-md"
              title="Previous page (Left Arrow)"
            >
              <ChevronLeft size={14} />
            </Button>
            <div className="flex items-center gap-1">
              <Input
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const parsed = parseInt(pageInput, 10)
                    if (!isNaN(parsed)) scrollToPage(parsed)
                  }
                }}
                className="w-11 h-6 text-xs text-center bg-zinc-900/80 border-border/70 text-foreground p-0 rounded"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                / {numPages || 1}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => scrollToPage(pageNumber + 1)}
              disabled={pageNumber >= (numPages || 1)}
              className="text-muted-foreground hover:text-foreground p-1 h-7 w-7 disabled:opacity-30 rounded-md"
              title="Next page (Right Arrow)"
            >
              <ChevronRight size={14} />
            </Button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 border-l border-border/60 pl-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScale((s) => Math.max(0.5, +(s - 0.15).toFixed(2)))}
              className="text-muted-foreground hover:text-foreground p-1.5 h-8 w-8 rounded-lg"
              title="Zoom out"
            >
              <ZoomOut size={13} />
            </Button>
            <span className="text-xs text-muted-foreground w-10 text-center select-none font-mono">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScale((s) => Math.min(2.5, +(s + 0.15).toFixed(2)))}
              className="text-muted-foreground hover:text-foreground p-1.5 h-8 w-8 rounded-lg"
              title="Zoom in"
            >
              <ZoomIn size={13} />
            </Button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 border-l border-border/60 pl-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAiPanelOpen((v) => !v)}
              className={`h-8 text-xs border-border gap-1.5 transition-colors rounded-lg ${
                aiPanelOpen
                  ? "bg-violet-600/20 text-violet-300 border-violet-500/30"
                  : "text-muted-foreground hover:text-white bg-transparent"
              }`}
            >
              <MessageSquare size={12} />
              Ask AI
            </Button>
            <BookmarkButton itemId={item.id} initial={item.is_bookmarked || false} />
            {item.source_url && (
              <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground p-1.5 h-8 w-8 rounded-lg"
                  title="Open original post"
                >
                  <ExternalLink size={13} />
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Floating Left Carousel Navigation Button */}
        {numPages > 1 && pageNumber > 1 && (
          <button
            onClick={() => scrollToPage(pageNumber - 1)}
            className="absolute left-6 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-white/80 hover:text-white border border-white/15 backdrop-blur-md shadow-2xl transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer"
            title="Previous page"
            aria-label="Previous page"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        {/* Floating Right Carousel Navigation Button */}
        {numPages > 1 && pageNumber < numPages && (
          <button
            onClick={() => scrollToPage(pageNumber + 1)}
            className="absolute right-6 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-white/80 hover:text-white border border-white/15 backdrop-blur-md shadow-2xl transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer"
            title="Next page"
            aria-label="Next page"
          >
            <ChevronRight size={22} />
          </button>
        )}

        {/* PDF Horizontal Canvas Container */}
        <div
          ref={containerRef}
          id="pdf-canvas-container"
          className="flex-1 overflow-x-auto overflow-y-hidden bg-[#09090D] z-10 relative scroll-smooth focus:outline-none"
          tabIndex={0}
        >
          <Document
            file={pdfApiUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(err) => console.error("PDF load error:", err)}
            loading={
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground w-full py-20">
                <FileText size={32} className="animate-pulse text-violet-400" />
                <span className="text-sm">Loading document carousel...</span>
              </div>
            }
            error={
              <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400/70 text-center w-full py-20">
                <FileText size={32} />
                <p className="text-sm font-medium">Failed to load PDF.</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Make sure the backend is running and the file exists in storage.
                </p>
              </div>
            }
            className="flex h-full min-w-max items-center px-12 md:px-20 gap-8 py-6"
          >
            {numPages > 0 &&
              Array.from({ length: numPages }, (_, index) => {
                const pageNum = index + 1
                return (
                  <div
                    key={pageNum}
                    id={`pdf-page-${pageNum}`}
                    className="flex-shrink-0 flex flex-col items-center justify-center relative group"
                  >
                    {/* Page Card */}
                    <div className="relative rounded-xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.85)] border border-white/10 bg-white transition-all duration-200">
                      <Page
                        pageNumber={pageNum}
                        height={containerHeight * scale}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        className="overflow-hidden select-text"
                        loading={
                          <div
                            style={{
                              height: containerHeight * scale,
                              width: containerHeight * scale * 0.72,
                            }}
                            className="flex flex-col items-center justify-center bg-zinc-900/90 text-muted-foreground gap-2 rounded-xl border border-border/40"
                          >
                            <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
                            <span className="text-xs font-medium text-zinc-400">
                              Page {pageNum}
                            </span>
                          </div>
                        }
                      />
                    </div>

                    {/* Page badge */}
                    <div className="mt-3 px-3 py-1 rounded-full bg-[#111118]/90 backdrop-blur-md border border-border/70 text-[11px] font-medium text-zinc-300 shadow-lg">
                      {pageNum} / {numPages}
                    </div>
                  </div>
                )
              })}
          </Document>
        </div>
      </div>

      {/* ── Right: AI Panel ───────────────────────────── */}
      {aiPanelOpen && (
        <div className="w-80 border-l border-border/60 flex flex-col bg-[#0D0D14] flex-shrink-0 relative z-30 select-text">
          {/* Panel header */}
          <div className="p-4 border-b border-border/50 flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-violet-600/20 flex items-center justify-center">
              <MessageSquare size={12} className="text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Ask AI</h3>
              <p className="text-[11px] text-muted-foreground">About this document</p>
            </div>
          </div>

          {/* Document context */}
          <div className="mx-4 my-3 p-3 bg-card rounded-lg border border-border/60">
            <div className="flex items-center gap-2 mb-1.5">
              <BookOpen size={11} className="text-violet-400" />
              <span className="text-[11px] text-muted-foreground font-medium">
                Document context
              </span>
            </div>
            <p
              className="text-xs text-muted-foreground leading-relaxed max-h-32 overflow-y-auto"
              title={item.summary}
            >
              {item.summary}
            </p>
            {item.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {item.tags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="text-[10px] text-violet-400/70 bg-violet-600/8
                                             px-1.5 py-0.5 rounded-full border border-violet-600/15"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-4">
            <div className="space-y-4 py-2">
              {aiMessages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Ask a question about this document.
                </p>
              )}
              {aiMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`text-xs leading-relaxed rounded-lg px-3 py-2 ${
                    msg.role === "user"
                      ? "bg-violet-600/20 text-violet-100 ml-4"
                      : "bg-card text-muted-foreground mr-4"
                  }`}
                >
                  {msg.id === "streaming" ? (
                    <StreamingMessage content={msg.content} />
                  ) : (
                    <MarkdownRenderer content={msg.content} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border/60">
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
                className="min-h-[60px] flex-1 resize-none border-border bg-card text-xs text-muted-foreground placeholder:text-muted-foreground focus-visible:ring-violet-500/30"
                rows={2}
              />
              <Button
                size="icon"
                className="h-8 w-8 shrink-0 bg-violet-600 hover:bg-violet-500 rounded-lg"
                disabled={!aiInput.trim() || aiStreaming}
                onClick={handleAiSend}
              >
                {aiStreaming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
