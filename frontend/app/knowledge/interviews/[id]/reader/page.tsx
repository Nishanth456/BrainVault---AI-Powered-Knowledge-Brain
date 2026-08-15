import { LinkedInReaderWrapper } from "@/components/knowledge/LinkedInReaderWrapper"
import type { Metadata } from "next"

interface ReaderPageProps {
  params: Promise<{ id: string }>
}

const INTERNAL_API_URL = process.env.INTERNAL_API_URL || "http://backend:8000"

async function getKnowledgeItem(id: string) {
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/knowledge/${id}`, {
      cache: "no-store",
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: ReaderPageProps): Promise<Metadata> {
  const { id } = await params
  const item = await getKnowledgeItem(id)
  return {
    title: item?.title ? `${item.title} — BrainVault Reader` : "PDF Reader — BrainVault",
  }
}

export default async function InterviewReaderPage({ params }: ReaderPageProps) {
  const { id } = await params
  const item = await getKnowledgeItem(id)

  if (!item || item.error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0A0A0F] text-zinc-400">
        <p className="text-sm">Knowledge item not found.</p>
      </div>
    )
  }

  const pdfPaths: string[] = (item.attachments || [])
    .filter((a: { file_type: string }) => a.file_type === "pdf")
    .map((a: { minio_path: string }) => a.minio_path)

  return (
    <LinkedInReaderWrapper
      item={item}
      pdfMinioPaths={pdfPaths}
    />
  )
}
