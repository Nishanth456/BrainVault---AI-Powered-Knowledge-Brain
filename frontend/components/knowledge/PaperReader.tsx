"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    ArrowLeft,
        BookOpen, ChevronDown,
    ChevronLeft, ChevronRight,
    ChevronRight as ChevronRightIcon,
    ExternalLink,
    FileText,
    MessageSquare,
    ZoomIn, ZoomOut
} from "lucide-react"
import Link from "next/link"
import { BookmarkButton } from "@/components/knowledge/BookmarkButton"
import { useCallback, useEffect, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`


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
  const [numPages, setNumPages]       = useState<number>(0)
  const [pageNumber, setPageNumber]   = useState<number>(1)
  const [pageInput, setPageInput]     = useState<string>("1")
  const [scale, setScale]             = useState<number>(1.0)
  const [aiPanelOpen, setAiPanelOpen] = useState<boolean>(true)
  const [containerHeight, setContainerHeight] = useState<number>(600)
  const [expanded, setExpanded]       = useState<Record<string, boolean>>({
    problem: true,
    methods: true,
    results: true,
  })

  const currentPdfPath = pdfMinioPaths[0]
  const pdfApiUrl = currentPdfPath
    ? `http://127.0.0.1:8000/api/files/${currentPdfPath}`
    : null

  useEffect(() => {
    const handleResize = () => {
      const pdfPanel = document.getElementById("pdf-canvas-container")
      if (pdfPanel) {
        setContainerHeight(Math.max(pdfPanel.clientHeight - 64, 400))
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

  const goToPage = (page: number) => {
    const clamped = Math.max(1, Math.min(numPages || 1, page))
    setPageNumber(clamped)
    setPageInput(String(clamped))
  }

  const toggleSection = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (!pdfApiUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0A0A0F] text-zinc-400 gap-4">
        <FileText size={40} className="text-zinc-700" />
        <p className="text-sm">No PDF attachment found for this paper.</p>
        <Link href="/knowledge/papers">
          <Button variant="outline" size="sm" className="border-white/10 text-zinc-400 hover:text-white">
            <ArrowLeft size={14} className="mr-2" />
            Back to Papers
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

          <Link href="/knowledge/papers">
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white p-2 h-8 w-8">
              <ArrowLeft size={15} />
            </Button>
          </Link>

          <div className="flex-1 min-w-0 hidden sm:block">
            <p className="text-sm font-medium text-white truncate leading-tight">{item.title}</p>
            {item.knowledge_tree && (
              <p className="text-[11px] text-zinc-600 truncate">{item.knowledge_tree}</p>
            )}
          </div>

          {/* Page navigation */}
          <div className="flex items-center gap-1.5 px-3">
            <Button
              variant="ghost" size="sm"
              onClick={() => goToPage(pageNumber - 1)}
              disabled={pageNumber <= 1}
              className="text-zinc-400 hover:text-white p-1 h-7 w-7 disabled:opacity-30"
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
                    if (!isNaN(parsed)) goToPage(parsed)
                  }
                }}
                className="w-12 h-7 text-xs text-center bg-white/[0.05] border-white/[0.08] text-white"
              />
              <span className="text-xs text-zinc-500">/ {numPages}</span>
            </div>
            <Button
              variant="ghost" size="sm"
              onClick={() => goToPage(pageNumber + 1)}
              disabled={pageNumber >= (numPages || 1)}
              className="text-zinc-400 hover:text-white p-1 h-7 w-7 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </Button>
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
              Structure
            </Button>
            <BookmarkButton itemId={item.id} initial={item.is_bookmarked || false} />
            {item.source_url && (
              <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                <Button
                  variant="ghost" size="sm"
                  className="text-zinc-400 hover:text-white p-1.5 h-8 w-8"
                  title="Open original paper"
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
            <Page
              pageNumber={pageNumber}
              height={containerHeight * scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-2xl shadow-black/60 rounded-sm bg-white overflow-hidden flex-shrink-0"
            />
          </Document>
        </div>
      </div>

      {/* ── Right: Structured Paper Panel ──────────────────────── */}
      {aiPanelOpen && (
        <div className="w-96 border-l border-white/[0.06] flex flex-col bg-[#0D0D14] flex-shrink-0 overflow-hidden">

          {/* Panel header */}
          <div className="p-4 border-b border-white/[0.05] flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-600/20 flex items-center justify-center">
              <BookOpen size={12} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Paper Structure</h3>
              <p className="text-[11px] text-zinc-500">AI-extracted breakdown</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Summary */}
            <div className="p-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
              <span className="text-[11px] text-zinc-500 font-medium">Summary</span>
              <p className="text-xs text-zinc-400 leading-relaxed mt-1.5">{item.summary}</p>
            </div>

            {/* Structured sections */}
            {SECTIONS.map(({ key, label }) => {
              const content = item.structured?.[key]
              if (!content || content === "Not available") return null
              const isOpen = expanded[key]

              return (
                <div key={key} className="border border-white/[0.06] rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection(key)}
                    className="w-full flex items-center justify-between p-3 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="text-xs font-medium text-white">{label}</span>
                    {isOpen
                      ? <ChevronDown size={14} className="text-zinc-500" />
                      : <ChevronRightIcon size={14} className="text-zinc-500" />
                    }
                  </button>
                  {isOpen && (
                    <div className="p-3 text-xs text-zinc-400 leading-relaxed border-t border-white/[0.06]">
                      {content}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Tags */}
            {item.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {item.tags.map(t => (
                  <span key={t} className="text-[10px] text-indigo-400/70 bg-indigo-600/8
                                           px-1.5 py-0.5 rounded-full border border-indigo-600/15">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
