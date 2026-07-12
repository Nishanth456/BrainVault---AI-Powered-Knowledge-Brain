import type { ReactNode } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

interface PageHeaderProps {
  title: string
  description: string
  backHref?: string
  backLabel?: string
  actions?: ReactNode
}

export function Header({ title, description, backHref, backLabel, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 group"
          >
            <ChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            {backLabel ?? "Back"}
          </Link>
        )}
        <h1 className="text-2xl font-bold text-foreground mb-1">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {actions && <div className="flex items-center gap-2 ml-4">{actions}</div>}
    </div>
  )
}
