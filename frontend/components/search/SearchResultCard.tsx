"use client"
import { BlogCard } from "@/components/knowledge/BlogCard"
import { LinkedInCard } from "@/components/knowledge/LinkedInCard"
import { NoteCard } from "@/components/knowledge/NoteCard"
import { PaperCard, type PaperItem } from "@/components/knowledge/PaperCard"
import { QnACard, type QnAItem } from "@/components/knowledge/QnACard"
import { CourseCard, type CourseItem } from "@/components/knowledge/CourseCard"
import { type LinkedInItem } from "@/components/knowledge/LinkedInCard"
import { type BlogItem } from "@/components/knowledge/BlogCard"
import { type NoteItem } from "@/components/knowledge/NoteCard"
import type { SearchResultItem } from "@/lib/api"
import { useRouter } from "next/navigation"

interface SearchResultCardProps {
  item: SearchResultItem
  onDelete?: (id: string) => void
}

export function SearchResultCard({ item, onDelete }: SearchResultCardProps) {
  const router = useRouter()
  
  switch (item.type) {
    case "linkedin":
      return (
        <LinkedInCard
          item={{
            ...item,
            reading_time: item.difficulty ? item.difficulty * 2 : 1,
            attachments: item.attachments,
          } as LinkedInItem}
          onDelete={onDelete}
        />
      )
    case "blog":
      return (
        <BlogCard
          item={{
            ...item,
            reading_time_minutes: item.difficulty ? item.difficulty * 2 : 3,
            importance_score: 0,
            site: item.knowledge_domain || "Blog",
          } as BlogItem}
          onDelete={onDelete}
        />
      )
    case "research":
    case "research_paper":
      return (
        <PaperCard
          item={{
            ...item,
            reading_time_minutes: item.difficulty ? item.difficulty * 3 : 5,
            importance_score: 0,
            key_concepts: item.key_concepts,
          } as PaperItem}
          onDelete={onDelete}
          onRead={(id) => router.push(`/knowledge/papers/${id}/reader`)}
        />
      )
    case "note":
      return (
        <NoteCard
          item={{
            ...item,
            reading_time: item.difficulty ? item.difficulty * 2 : 1,
          } as NoteItem}
          onDelete={onDelete}
        />
      )
    case "interview_qna":
      return <QnACard item={{ ...item, source_url: item.source_url || "" } as QnAItem} />
    case "course":
      return (
        <CourseCard
          item={{
            ...item,
            reading_time: item.difficulty ? item.difficulty * 2 : 1,
          } as CourseItem}
          onDelete={onDelete}
        />
      )
    default:
      return (
        <BlogCard
          item={{
            ...item,
            reading_time_minutes: item.difficulty ? item.difficulty * 2 : 3,
            importance_score: 0,
            site: item.knowledge_domain || item.type,
          } as BlogItem}
          onDelete={onDelete}
        />
      )
  }
}

