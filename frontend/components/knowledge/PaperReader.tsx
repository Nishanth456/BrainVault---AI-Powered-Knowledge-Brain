"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquare,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
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

interface PaperReaderProps {
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
  pdfMinioPaths: string[]
}

const SECTIONS: { key: string; label: string }[] = [
  { key: "problem", label: "Problem" },
  { key: "methods", label: "Methods" },
  { key: "results", label: "Results" },
  { key: "conclusion", label: "Conclusion" },
  { key: "limitations", label: "Limitations" },
  { key: "future_work", label: "Future Work" },
]

export function PaperReader({ item, pdfMinioPaths }: PaperReaderProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [pageInput, setPageInput] = useState<string>("1")
  const [scale, setScale] = useState<number>(1.0)
  const [aiPanelOpen, setAiPanelOpen] = useState<boolean>(true)
  const [containerHeight, setContainerHeight] = useState<number>(600)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    problem: true,
    methods: true,
    results: true,
  })

  const containerRef = useRef<HTMLDivElement>(null)

  const currentPdfPath = pdfMinioPaths[0]
  const pdfApiUrl = currentPdfPath
    ? `http://127.0.0.1:8000/api/files/${currentPdfPath}`
    : null

  useEffect(() => {
    if (typeof window !== "undefined") {
      pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
    }
    const handleResize = () => {
      const pdfPanel = document.getElementById("pdf-canvas-container")
      if (pdfPanel) {
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

  // Mouse wheel horizontal scroll listener
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
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

  const toggleSection = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (!pdfApiUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0A0A0F] text-muted-foreground gap-4">
        <FileText size={40} className="text-zinc-700" />
        <p className="text-sm">No PDF attachment found for this paper.</p>
        <Link href="/knowledge/papers">
          <Button
            variant="outline"
            size="sm"
            className="border-border text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} className="mr-2" />
            Back to Papers
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
          <Link href="/knowledge/papers">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground p-2 h-8 w-8 rounded-lg"
            >
              <ArrowLeft size={15} />
            </Button>
          </Link>

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
                  ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/30"
                  : "text-muted-foreground hover:text-white bg-transparent"
              }`}
            >
              <MessageSquare size={12} />
              Structure
            </Button>
            <BookmarkButton itemId={item.id} initial={item.is_bookmarked || false} />
            {item.source_url && (
              <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground p-1.5 h-8 w-8 rounded-lg"
                  title="Open original paper"
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
                <FileText size={32} className="animate-pulse text-indigo-400" />
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
                            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
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

      {/* ── Right: Structured Paper Panel ──────────────────────── */}
      {aiPanelOpen && (
        <div className="w-96 border-l border-border/60 flex flex-col bg-[#0D0D14] flex-shrink-0 overflow-hidden select-text">
          {/* Panel header */}
          <div className="p-4 border-b border-border/50 flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-600/20 flex items-center justify-center">
              <BookOpen size={12} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Paper Structure</h3>
              <p className="text-[11px] text-muted-foreground">AI-extracted breakdown</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Summary */}
            <div className="p-3 bg-card rounded-lg border border-border/60">
              <span className="text-[11px] text-muted-foreground font-medium">Summary</span>
              <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">{item.summary}</p>
            </div>

            {/* Structured sections */}
            {SECTIONS.map(({ key, label }) => {
              const content = item.structured?.[key]
              if (!content || content === "Not available") return null
              const isOpen = expanded[key]

              return (
                <div key={key} className="border border-border/60 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection(key)}
                    className="w-full flex items-center justify-between p-3 bg-card/50 hover:bg-accent/50 transition-colors"
                  >
                    <span className="text-xs font-medium text-foreground">{label}</span>
                    {isOpen ? (
                      <ChevronDown size={14} className="text-muted-foreground" />
                    ) : (
                      <ChevronRightIcon size={14} className="text-muted-foreground" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="p-3 text-xs text-muted-foreground leading-relaxed border-t border-border/60">
                      {content}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Tags & Concepts */}
            {(() => {
              const allTags = Array.from(new Set([...(item.key_concepts || []), ...(item.tags || [])]));
              if (allTags.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {allTags.map(tag => (
                    <span
                      key={tag}
                      className="text-[10px] text-indigo-400/70 bg-indigo-600/8
                                 px-1.5 py-0.5 rounded-full border border-indigo-600/15"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
