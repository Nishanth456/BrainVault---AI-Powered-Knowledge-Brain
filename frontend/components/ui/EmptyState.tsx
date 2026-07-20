import { ReactNode } from "react"
import Link from "next/link"

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  hint?: string
  action?: ReactNode | { label: string; href: string }
}

export function EmptyState({ icon, title, description, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mb-5 shadow-inner">
        {icon}
      </div>
      <h3 className="text-foreground font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm max-w-sm leading-relaxed">{description}</p>
      {hint && (
        <p className="text-xs text-muted-foreground/60 mt-3 max-w-xs leading-relaxed">{hint}</p>
      )}
      {action && (
        <div className="mt-5">
          {action && typeof action === 'object' && 'label' in action && 'href' in action ? (
            <Link href={(action as { href: string }).href} className="text-sm bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              {(action as { label: string }).label}
            </Link>
          ) : (
            action as ReactNode
          )}
        </div>
      )}
    </div>
  )
}
