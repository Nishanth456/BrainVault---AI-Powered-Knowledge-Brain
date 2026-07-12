import { ReactNode } from "react"

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  hint?: string
}

export function EmptyState({ icon, title, description, hint }: EmptyStateProps) {
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
    </div>
  )
}
