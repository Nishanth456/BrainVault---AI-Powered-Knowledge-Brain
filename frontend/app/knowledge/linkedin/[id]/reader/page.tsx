import { LinkedInReader } from "@/components/knowledge/LinkedInReader"
import type { Metadata } from "next"

interface ReaderPageProps {
  params: Promise<{ id: string }>
}

async function getKnowledgeItem(id: string) {
  try {
    const res = await fetch(`http://127.0.0.1:8000/api/knowledge/${id}`, {
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

export default async function LinkedInReaderPage({ params }: ReaderPageProps) {
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
    <LinkedInReader
      item={item}
      pdfMinioPaths={pdfPaths}
    />
  )
}
