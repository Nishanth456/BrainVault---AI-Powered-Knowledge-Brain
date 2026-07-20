"use client"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { SearchResultItem } from "@/lib/api"
import { cn } from "@/lib/utils"

interface SourceCitationCardProps {
  citation: SearchResultItem
  compact?: boolean
}

export function SourceCitationCard({ citation, compact }: SourceCitationCardProps) {
  return (
    <Card
      className={cn(
        "cursor-pointer border-l-4 border-l-violet-500 transition-colors hover:bg-muted/50",
        compact ? "p-2" : "p-3"
      )}
      onClick={() => {
        if (citation.source_url) {
          window.open(citation.source_url, "_blank", "noopener,noreferrer")
        }
      }}
    >
      <div className="flex items-start gap-2">
        {citation.index && (
          <Badge variant="outline" className="shrink-0 font-mono text-xs">
            [{citation.index}]
          </Badge>
        )}
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium leading-tight", compact ? "text-xs" : "text-sm")}>
            {citation.title || "Untitled"}
          </p>
          {citation.author && (
            <p className="mt-0.5 text-xs text-muted-foreground">{citation.author}</p>
          )}
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">
          {citation.type}
        </Badge>
      </div>
      {!compact && citation.summary && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{citation.summary}</p>
      )}
    </Card>
  )
}
