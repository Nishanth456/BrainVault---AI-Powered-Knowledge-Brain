"use client"
import { Download } from "lucide-react"

export interface Attachment {
  minio_path: string
  filename: string
  id?: string
  file_type?: string
  page_count?: number | null
}

export function ExportButton({ attachments }: { attachments?: Attachment[] }) {
  if (!attachments || attachments.length === 0) return null

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Download the first attachment
    const att = attachments[0]
    if (!att.minio_path) return

    const url = `http://127.0.0.1:8000/api/files/${att.minio_path}`
    
    const a = document.createElement("a")
    a.href = url
    a.download = att.filename || "download"
    a.target = "_blank"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <button
      onClick={handleDownload}
      className="p-1.5 rounded-md border border-white/10 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
      title="Download Attachment"
    >
      <Download size={14} />
    </button>
  )
}
