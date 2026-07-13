"use client"
import { BlogCard } from "@/components/knowledge/BlogCard"
import { LinkedInCard } from "@/components/knowledge/LinkedInCard"
import { NoteCard } from "@/components/knowledge/NoteCard"
import { PaperCard } from "@/components/knowledge/PaperCard"
import { QnACard } from "@/components/knowledge/QnACard"
import type { SearchResultItem } from "@/lib/api"

interface SearchResultCardProps {
  item: SearchResultItem
  onDelete?: (id: string) => void
}

export function SearchResultCard({ item, onDelete }: SearchResultCardProps) {
  switch (item.type) {
    case "linkedin":
      return (
        <LinkedInCard
          item={{
            ...item,
            reading_time: item.difficulty ? item.difficulty * 2 : 1,
            attachments: item.attachments,
          }}
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
          }}
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
          }}
          onDelete={onDelete}
        />
      )
    case "note":
      return (
        <NoteCard
          item={{
            ...item,
            reading_time: item.difficulty ? item.difficulty * 2 : 1,
          }}
          onDelete={onDelete}
        />
      )
    case "interview_qna":
      return <QnACard item={{ ...item, source_url: item.source_url || "" }} />
    default:
      return (
        <BlogCard
          item={{
            ...item,
            reading_time_minutes: item.difficulty ? item.difficulty * 2 : 3,
            importance_score: 0,
            site: item.knowledge_domain || item.type,
          }}
          onDelete={onDelete}
        />
      )
  }
}
