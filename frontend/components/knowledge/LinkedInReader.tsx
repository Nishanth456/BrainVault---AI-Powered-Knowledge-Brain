"use client"
import { useState, useCallback, useEffect } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"
import {
  ChevronLeft, ChevronRight, MessageSquare, Bookmark,
  ExternalLink, ArrowLeft, FileText, ZoomIn, ZoomOut,
  BookOpen
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

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

      {/* ── Right: AI Panel (stub — Phase 6) ──────────────────────── */}
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

          {/* Coming soon state */}
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-violet-600/10 border border-violet-600/15
                              flex items-center justify-center mx-auto mb-4">
                <MessageSquare size={20} className="text-violet-600/50" />
              </div>
              <p className="text-sm text-zinc-400 font-medium mb-1">
                RAG Chat — Phase 6
              </p>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Ask questions about this document and get answers from your full knowledge base.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
