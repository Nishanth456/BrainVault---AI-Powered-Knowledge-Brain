"use client"
import * as LucideIcons from "lucide-react"

import React from "react"

export function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  const Icon = (LucideIcons as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[icon] || LucideIcons.Circle

  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4 hover:bg-accent transition-colors group shadow-sm">
      <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
        <Icon size={24} className="text-violet-600 dark:text-violet-400" />
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
      </div>
    </div>
  )
}
